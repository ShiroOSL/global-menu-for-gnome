import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const POLL_INTERVAL_MS = 1000;
const MAX_ITEMS = 100;
const MAX_PREVIEW_LEN = 500;
// Hard cap on stored text length so a huge copy (e.g. an entire file's
// contents) can't bloat the GSettings/dconf value unboundedly.
const MAX_STORED_LEN = 20000;

// Tracks clipboard text history via polling (St.Clipboard has no
// change-notify signal on X11/Wayland shell side, so we poll).
export class ClipboardHistoryStore {
    constructor(settings) {
        this._settings = settings;
        this._pollId = null;
        this._lastText = null;
        this._listeners = new Set();
    }

    start() {
        if (this._pollId) return;

        // Mirrors the common "clear on boot" pattern used by clipboard
        // managers like Clipboard Indicator: since GNOME Shell restarts
        // extensions on every login/Shell restart, checking the pref
        // once here (before the first poll) is enough to wipe stale
        // history from a previous session.
        if (this._settings.get_boolean('clipboard-clear-on-startup')) {
            this.clearAll();
        }

        this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }
    }

    _poll() {
        try {
            St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_cb, text) => {
                if (!text || text.trim().length === 0) return;
                if (text === this._lastText) return;
                this._lastText = text;
                this._addEntry(text);
            });
        } catch (e) {
            // Silently ignore transient clipboard read errors.
        }
    }

    _addEntry(text) {
        // Cap what actually gets persisted; _lastText (used for dedupe)
        // still tracks the raw copied text so re-copying the same huge
        // value doesn't create duplicate truncated entries.
        let storedText = text.length > MAX_STORED_LEN
            ? text.slice(0, MAX_STORED_LEN)
            : text;

        let list = this.getAll();
        // De-dupe: if this text already exists, move it to top (keep pin state).
        let existingIdx = list.findIndex(e => e.text === storedText);
        let pinned = false;
        if (existingIdx !== -1) {
            pinned = !!list[existingIdx].pinned;
            list.splice(existingIdx, 1);
        }
        list.unshift({ text: storedText, pinned, time: Date.now() });

        // Trim unpinned overflow beyond MAX_ITEMS, oldest first.
        let pinnedItems = list.filter(e => e.pinned);
        let unpinnedItems = list.filter(e => !e.pinned);
        let allowedUnpinned = Math.max(0, MAX_ITEMS - pinnedItems.length);
        unpinnedItems = unpinnedItems.slice(0, allowedUnpinned);

        // Re-merge preserving original relative order.
        let merged = [];
        let pi = 0, ui = 0;
        for (const e of list) {
            if (e.pinned) merged.push(pinnedItems[pi++]);
            else if (ui < unpinnedItems.length && unpinnedItems[ui] === e) merged.push(unpinnedItems[ui++]);
        }

        this._save(merged);
        this._notify();
    }

    getAll() {
        try {
            let raw = this._settings.get_string('clipboard-history') || '[]';
            let arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    _save(list) {
        this._settings.set_string('clipboard-history', JSON.stringify(list));
    }

    togglePin(index) {
        let list = this.getAll();
        if (list[index]) {
            list[index].pinned = !list[index].pinned;
            this._save(list);
            this._notify();
        }
    }

    removeAt(index) {
        let list = this.getAll();
        list.splice(index, 1);
        this._save(list);
        this._notify();
    }

    clearAll() {
        // Keep pinned items; wipe the rest. This matches the "toggle to
        // keep it from being deleted" behavior for pinned entries.
        let list = this.getAll().filter(e => e.pinned);
        this._save(list);
        this._lastText = null;
        this._notify();
    }

    setClipboard(text) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        this._lastText = text;
    }

    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _notify() {
        this._listeners.forEach(cb => {
            try { cb(); } catch (e) { /* ignore listener errors */ }
        });
    }

    destroy() {
        this.stop();
        this._listeners.clear();
    }
}

// Floating Win11-style clipboard panel. Built lazily and reused.
export class ClipboardPanel {
    constructor(store) {
        this._store = store;
        this._actor = null;
        this._listBox = null;
        this._unsubscribe = null;
        this._openedFor = null; // target actor used for positioning
    }

    _ensureBuilt() {
        if (this._actor) return;

        // "popup-menu-content" is the same style class GNOME Shell's own
        // PopupMenu uses for its background box, so this panel picks up
        // whatever background/border/radius the user's active shell theme
        // defines, instead of a hardcoded look.
        this._actor = new St.BoxLayout({
            style_class: 'globalmenu-clipboard-panel popup-menu-content',
            vertical: true,
            reactive: true,
            visible: false,
        });

        let header = new St.BoxLayout({
            style_class: 'globalmenu-clipboard-header',
            reactive: true,
        });
        let title = new St.Label({
            text: 'Clipboard History',
            style_class: 'globalmenu-clipboard-title popup-subtitle-menu-item',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(title);

        let clearBtn = new St.Button({
            style_class: 'globalmenu-clipboard-clearbtn button',
            label: 'Clear all',
            x_expand: false,
        });
        clearBtn.connect('clicked', () => this._store.clearAll());
        header.add_child(clearBtn);

        let closeBtn = new St.Button({
            style_class: 'globalmenu-clipboard-closebtn button',
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: 14,
            }),
        });
        closeBtn.connect('clicked', () => this.close());
        header.add_child(closeBtn);

        this._actor.add_child(header);

        this._scroll = new St.ScrollView({
            style_class: 'globalmenu-clipboard-scroll',
            overlay_scrollbars: true,
        });
        this._listBox = new St.BoxLayout({ vertical: true, style_class: 'globalmenu-clipboard-list' });
        this._scroll.set_child(this._listBox);
        this._actor.add_child(this._scroll);

        Main.uiGroup.add_child(this._actor);

        this._unsubscribe = this._store.onChange(() => this._render());
    }

    _render() {
        if (!this._listBox) return;
        this._listBox.destroy_all_children();

        let items = this._store.getAll();
        if (items.length === 0) {
            let empty = new St.Label({
                text: 'No clipboard items yet',
                style_class: 'globalmenu-clipboard-empty popup-inactive-menu-item',
            });
            this._listBox.add_child(empty);
            return;
        }

        items.forEach((entry, index) => {
            this._listBox.add_child(this._makeCard(entry, index));
        });
    }

    _makeCard(entry, index) {
        let card = new St.Button({
            style_class: 'globalmenu-clipboard-card popup-menu-item',
            x_expand: true,
            can_focus: true,
        });

        let row = new St.BoxLayout({ vertical: false, x_expand: true });

        let preview = entry.text.length > MAX_PREVIEW_LEN
            ? entry.text.slice(0, MAX_PREVIEW_LEN) + '…'
            : entry.text;
        let label = new St.Label({
            text: preview.replace(/\n/g, ' ⏎ '),
            style_class: 'globalmenu-clipboard-card-text',
            x_expand: true,
        });
        label.clutter_text.set_line_wrap(true);
        label.clutter_text.set_ellipsize(3); // PANGO_ELLIPSIZE_END fallback
        row.add_child(label);

        let pinBtn = new St.Button({
            style_class: entry.pinned
                ? 'globalmenu-clipboard-pinbtn button globalmenu-clipboard-pinbtn-active'
                : 'globalmenu-clipboard-pinbtn button',
            child: new St.Icon({
                // Filled star when pinned, outline when not — a bolder,
                // more legible toggle than the old pin glyph.
                icon_name: entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
                icon_size: 16,
            }),
        });
        pinBtn.connect('clicked', (btn, event) => {
            this._store.togglePin(index);
            return Clutter.EVENT_STOP;
        });
        row.add_child(pinBtn);

        let removeBtn = new St.Button({
            style_class: 'globalmenu-clipboard-removebtn button',
            child: new St.Icon({
                icon_name: 'edit-delete-symbolic',
                icon_size: 14,
            }),
        });
        removeBtn.connect('clicked', () => {
            this._store.removeAt(index);
            return Clutter.EVENT_STOP;
        });
        row.add_child(removeBtn);

        card.set_child(row);
        card.connect('clicked', () => {
            this._store.setClipboard(entry.text);
            this._pasteIntoFocusedApp();
            this.close();
        });

        return card;
    }

    _pasteIntoFocusedApp() {
        try {
            let seat = Clutter.get_default_backend().get_default_seat();
            let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            if (!virtualDevice) return;
            let ctrlScanCode = 29;
            let vScanCode = 47;
            // Small delay lets the clipboard write land before paste fires.
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                let t = GLib.get_monotonic_time();
                virtualDevice.notify_key(t, ctrlScanCode, Clutter.KeyState.PRESSED);
                virtualDevice.notify_key(t + 10, vScanCode, Clutter.KeyState.PRESSED);
                virtualDevice.notify_key(t + 20, vScanCode, Clutter.KeyState.RELEASED);
                virtualDevice.notify_key(t + 30, ctrlScanCode, Clutter.KeyState.RELEASED);
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            // Ignore; clipboard is still set even if synthesized paste fails.
        }
    }

    _positionNear(sourceActor) {
        if (!sourceActor) return;
        let [x, y] = sourceActor.get_transformed_position();
        let sourceHeight = sourceActor.get_height();
        let monitor = Main.layoutManager.findMonitorForActor(sourceActor)
            || Main.layoutManager.primaryMonitor;

        let panelWidth = 380;
        let panelHeight = 460;
        this._actor.set_size(panelWidth, panelHeight);

        let posX = Math.round(x);
        let posY = Math.round(y + sourceHeight + 6);

        if (monitor) {
            if (posX + panelWidth > monitor.x + monitor.width)
                posX = monitor.x + monitor.width - panelWidth - 8;
            if (posX < monitor.x) posX = monitor.x + 8;
            if (posY + panelHeight > monitor.y + monitor.height)
                posY = Math.round(y) - panelHeight - 6;
        }

        this._actor.set_position(posX, posY);
    }

    toggle(sourceActor) {
        if (this._actor && this._actor.visible) {
            this.close();
        } else {
            this.open(sourceActor);
        }
    }

    open(sourceActor) {
        this._ensureBuilt();
        this._render();
        this._positionNear(sourceActor);
        this._actor.show();
        Main.uiGroup.set_child_above_sibling(this._actor, null);
    }

    close() {
        if (this._actor) this._actor.hide();
    }

    destroy() {
        this.close();
        if (this._unsubscribe) this._unsubscribe();
        if (this._actor) {
            this._actor.destroy();
            this._actor = null;
        }
    }
}
