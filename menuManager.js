import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {appMenuItems, builtinMenus} from './menuModel.js';
import {debug, spawn, spawnLine} from './utils.js';

const HOME = GLib.get_home_dir();
const UserDir = GLib.UserDirectory;

const specialDir = (type, fallback) => GLib.get_user_special_dir(type) || `${HOME}/${fallback}`;

const LAUNCHERS = {
    'open-file-manager': () => ['xdg-open', HOME],
    'new-file-manager-win': () => ['xdg-open', HOME],
    'go-home': () => ['xdg-open', HOME],
    'go-recents': () => ['xdg-open', 'recent:///'],
    'go-documents': () => ['xdg-open', specialDir(UserDir.DIRECTORY_DOCUMENTS, 'Documents')],
    'go-desktop': () => ['xdg-open', specialDir(UserDir.DIRECTORY_DESKTOP, 'Desktop')],
    'go-downloads': () => ['xdg-open', specialDir(UserDir.DIRECTORY_DOWNLOAD, 'Downloads')],
    'open-settings': () => ['gnome-control-center'],
    'open-system-help': () => ['yelp'],
    'empty-bin': () => ['gio', 'trash', '--empty'],
};

const WINDOW_ACTIONS = {
    close: win => win.delete(global.get_current_time()),
    minimize: win => win.minimize(),
    maximize: win => (win.is_maximized() ? win.unmaximize() : win.maximize()),
};

// evdev key codes
const KEY = {
    A: 30, C: 46, H: 35, N: 49, P: 25, T: 20, V: 47, X: 45, Z: 44,
    CTRL: 29, SHIFT: 42, ALT: 56,
    ENTER: 28, DELETE: 111, LEFT: 105, RIGHT: 106, F10: 68, F11: 87,
};

const SHORTCUTS = {
    'copy': [KEY.CTRL, KEY.C],
    'paste': [KEY.CTRL, KEY.V],
    'cut': [KEY.CTRL, KEY.X],
    'undo': [KEY.CTRL, KEY.Z],
    'redo': [KEY.CTRL, KEY.SHIFT, KEY.Z],
    'select-all': [KEY.CTRL, KEY.A],
    'new-tab': [KEY.CTRL, KEY.T],
    'print': [KEY.CTRL, KEY.P],
    'toggle-fullscreen': [KEY.F11],
    'go-back': [KEY.ALT, KEY.LEFT],
    'go-forward': [KEY.ALT, KEY.RIGHT],
    'delete-item': [KEY.DELETE],
    'virtual-open': [KEY.ENTER],
    'properties': [KEY.ALT, KEY.ENTER],
};

const MODIFIER_KEYVALS = {
    control: Clutter.KEY_Control_L,
    ctrl: Clutter.KEY_Control_L,
    primary: Clutter.KEY_Control_L,
    shift: Clutter.KEY_Shift_L,
    alt: Clutter.KEY_Alt_L,
    mod1: Clutter.KEY_Alt_L,
    super: Clutter.KEY_Super_L,
    mod4: Clutter.KEY_Super_L,
};

function parseAccelerator(accelerator) {
    const match = /^((?:<\w+>)*)(\w+)$/.exec(accelerator.trim());
    if (!match)
        return null;

    const held = [...match[1].matchAll(/<(\w+)>/g)].map(([, name]) => MODIFIER_KEYVALS[name.toLowerCase()]);
    const keyval = Clutter[`KEY_${match[2]}`];
    return held.includes(undefined) || keyval === undefined ? null : {held, keyval};
}

export function addToPanel(role, button, position, box) {
    try {
        Main.panel.addToStatusArea(role, button, position, box);
    } catch (e) {
        if (Main.panel.statusArea[role] !== button) {
            button.destroy();
            throw e;
        }
        debug(`panel hook failed after adding ${role}: ${e}`);
    }
}

const FILE_MANAGERS = ['nautilus', 'nemo', 'caja', 'thunar'];

const IGNORED_APPS = [
    'gjs', 'org.gnome.gjs', 'gnome-shell', 'mutter',
    'nautilus', 'org.gnome.nautilus', 'io.github.shiroosl.globalmenu',
];

const titleCase = id => id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function focusedApp(window) {
    if (!window || window.get_window_type() !== Meta.WindowType.NORMAL)
        return null;

    const app = Shell.WindowTracker.get_default().get_window_app(window);
    const wmClass = window.get_wm_class() ?? '';
    const identity = [app?.get_id(), app?.get_name(), wmClass, window.get_title()].join(' ').toLowerCase();

    if (IGNORED_APPS.some(name => identity.includes(name)) || !(app || wmClass))
        return null;

    if (app)
        return {app, name: app.get_name(), desktopId: app.get_id()};
    return {app: null, name: titleCase(wmClass), desktopId: `${wmClass.toLowerCase()}.desktop`};
}

function inNautilus(window) {
    if (!window || window.get_window_type() !== Meta.WindowType.NORMAL)
        return false;

    const app = Shell.WindowTracker.get_default().get_window_app(window);
    return `${app?.get_id() ?? ''} ${window.get_wm_class() ?? ''}`.toLowerCase().includes('nautilus');
}

function createDesktopFolder() {
    const desktop = specialDir(UserDir.DIRECTORY_DESKTOP, 'Desktop');
    const fileFor = name => Gio.File.new_for_path(GLib.build_filenamev([desktop, name]));

    let name = 'Untitled Folder';
    for (let n = 2; fileFor(name).query_exists(null); n++)
        name = `Untitled Folder ${n}`;

    try {
        fileFor(name).make_directory(null);
    } catch (e) {
        debug(`could not create folder: ${e}`);
    }
}

const TopLevelMenuButton = GObject.registerClass(
class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, app = null, showIcons = true) {
        super._init(0.5, label);
        this._app = app;
        this._showIcons = showIcons;
        this._keyboard = null;
        this._timeouts = new Set();

        this.add_child(new St.Label({
            text: label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-button-label',
        }));

        this.menu.box.add_style_class_name('globalmenu-menu');
        this._fill(children, this.menu);
        this.menu.connectObject('open-state-changed', () => this._centerMenu(), this);
    }

    _centerMenu() {
        const buttonWidth = Math.round(this.get_width());
        const menuWidth = Math.round(this.menu.actor?.get_width() ?? 0);
        if (buttonWidth <= 0 || menuWidth <= 0)
            return;

        let offset = Math.round((menuWidth - buttonWidth) / 2);

        const [buttonX] = this.get_transformed_position();
        const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
        if (monitor) {
            const left = buttonX - offset;
            const right = left + menuWidth;
            if (left < monitor.x)
                offset -= monitor.x - left;
            else if (right > monitor.x + monitor.width)
                offset += right - (monitor.x + monitor.width);
        }

        this.menu.actor.translation_x = offset;
    }

    _fill(items, menu) {
        for (const item of items) {
            if (item.type === 'separator') {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            } else if (item.type === 'section-header') {
                const heading = new PopupMenu.PopupMenuItem(item.label, {activate: false});
                heading.setSensitive(false);
                heading.label.add_style_class_name('popup-subtitle-menu-item');
                menu.addMenuItem(heading);
            } else if (item.type === 'submenu') {
                const withIcon = this._showIcons && !!item.icon;
                const sub = new PopupMenu.PopupSubMenuMenuItem(item.label, withIcon);
                if (withIcon)
                    sub.icon.icon_name = item.icon;
                this._fill(item.children, sub.menu);
                menu.addMenuItem(sub);
            } else {
                menu.addMenuItem(this._actionItem(item));
            }
        }
    }

    _actionItem({label, icon, action, enabled}) {
        const entry = icon && this._showIcons
            ? new PopupMenu.PopupImageMenuItem(label, icon)
            : new PopupMenu.PopupMenuItem(label);
        entry.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        if (enabled === false)
            entry.setSensitive(false);
        else if (action)
            entry.connectObject('activate', () => this._perform(action), entry);
        return entry;
    }

    _perform(action) {
        const split = action.indexOf(':');
        const kind = split < 0 ? action : action.slice(0, split);
        const arg = split < 0 ? '' : action.slice(split + 1);

        switch (kind) {
        case 'custom-command':
            spawnLine(arg);
            return;
        case 'custom-shortcut':
            this._sendAccelerator(arg);
            return;
        case 'activate-window':
            this._activateWindow(arg);
            return;
        case 'new-app-window':
            this._app?.open_new_window(-1);
            return;
        case 'app-details':
            if (arg)
                spawn(['gnome-software', `--details=${arg}`]);
            return;
        case 'new-folder':
            this._newFolder();
            return;
        case 'native-open-with':
            this._openWith();
            return;
        }

        const windowAction = WINDOW_ACTIONS[action];
        if (windowAction) {
            const window = global.display.get_focus_window();
            if (window)
                windowAction(window);
        } else if (LAUNCHERS[action]) {
            spawn(LAUNCHERS[action]());
        } else if (SHORTCUTS[action]) {
            this._tap(SHORTCUTS[action]);
        }
    }

    _activateWindow(id) {
        const target = this._app?.get_windows().find(win => String(win.get_id()) === id);
        target?.activate(global.get_current_time());
    }

    _virtualKeyboard() {
        const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
        this._keyboard ??= backend.get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        return this._keyboard;
    }

    _newFolder() {
        const window = global.display.get_focus_window();
        const app = window && Shell.WindowTracker.get_default().get_window_app(window);
        const id = [app?.get_id(), window?.get_wm_class()].join(' ').toLowerCase();
        const inFileManager = window?.get_window_type() === Meta.WindowType.NORMAL &&
            FILE_MANAGERS.some(name => id.includes(name));

        if (inFileManager)
            this._tap([KEY.CTRL, KEY.SHIFT, KEY.N]);
        else
            createDesktopFolder();
    }

    _tap(keys) {
        try {
            const keyboard = this._virtualKeyboard();
            let time = GLib.get_monotonic_time();
            for (const key of keys)
                keyboard.notify_key(time += 10, key, Clutter.KeyState.PRESSED);
            for (const key of [...keys].reverse())
                keyboard.notify_key(time += 10, key, Clutter.KeyState.RELEASED);
        } catch (e) {
            debug(`virtual keyboard failed: ${e}`);
        }
    }

    _sendAccelerator(accelerator) {
        const parsed = parseAccelerator(accelerator);
        if (!parsed) {
            debug(`could not parse shortcut '${accelerator}'`);
            return;
        }

        const {held, keyval} = parsed;
        try {
            const keyboard = this._virtualKeyboard();
            let time = GLib.get_monotonic_time();
            for (const key of [...held, keyval])
                keyboard.notify_keyval(time += 5, key, Clutter.KeyState.PRESSED);
            for (const key of [keyval, ...[...held].reverse()])
                keyboard.notify_keyval(time += 5, key, Clutter.KeyState.RELEASED);
        } catch (e) {
            debug(`could not send shortcut '${accelerator}': ${e}`);
        }
    }

    _openWith() {
        this._tap([KEY.SHIFT, KEY.F10]);
        this._delay(150, () => this._tap([KEY.H]));
    }

    _delay(ms, callback) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeouts.delete(id);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._timeouts.add(id);
    }

    destroy() {
        this._timeouts.forEach(id => GLib.source_remove(id));
        this._timeouts.clear();
        this._keyboard = null;
        super.destroy();
    }
});

export class MenuManager {
    constructor(uuid, settings) {
        this.uuid = uuid;
        this._settings = settings;
        this._buttons = [];
        this._rebuildPending = false;
        this._rebuildId = 0;
    }

    updateMenuForWindow(window) {
        if (this._buttons.some(button => button.menu.isOpen)) {
            this._rebuildWhenClosed();
            return;
        }

        const focus = focusedApp(window);
        const inFiles = inNautilus(window);
        const desktopName = this._settings.get_string('desktop-app-name') || 'Nautilus';
        const enabled = key => this._settings.get_boolean(key);
        const showIcons = enabled('show-menu-icons');

        const menus = [];
        if (enabled('menu-app-enabled')) {
            menus.push({
                label: focus?.name ?? desktopName,
                children: appMenuItems(focus, desktopName, inFiles),
            });
        }
        for (const [key, menu] of builtinMenus(desktopName, inFiles)) {
            if (enabled(key))
                menus.push(menu);
        }
        menus.push(...this._customMenus());

        this.clear();

        const firstSlot = (enabled('hide-overview-button') ? 0 : 1) + (enabled('show-logo-menu') ? 1 : 0);
        menus.forEach((menu, i) => {
            const button = new TopLevelMenuButton(menu.label, menu.children, focus?.app ?? null, showIcons);
            addToPanel(`${this.uuid}-${i}`, button, firstSlot + i, 'left');
            this._buttons.push(button);
        });
    }

    _customMenus() {
        let sections;
        try {
            sections = JSON.parse(this._settings.get_string('custom-menus') || '[]');
        } catch (_e) {
            sections = [];
        }

        return sections
            .filter(section => section && section.enabled !== false)
            .map(section => {
                const children = (Array.isArray(section.items) ? section.items : [])
                    .filter(entry => entry?.value)
                    .map(entry => ({
                        label: entry.label || '(untitled)',
                        action: `${entry.kind === 'shortcut' ? 'custom-shortcut' : 'custom-command'}:${entry.value}`,
                    }));

                if (children.length === 0)
                    children.push({label: 'No items configured', enabled: false});

                return {label: section.label || 'Custom', children};
            });
    }

    _rebuildWhenClosed() {
        if (this._rebuildPending)
            return;
        this._rebuildPending = true;

        const {menu} = this._buttons.find(button => button.menu.isOpen);
        const id = menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen || !this._rebuildPending)
                return;
            menu.disconnect(id);
            this._rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._rebuildId = 0;
                this._rebuildPending = false;
                this.updateMenuForWindow(global.display.get_focus_window());
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    clear() {
        if (this._rebuildId)
            GLib.source_remove(this._rebuildId);
        this._rebuildId = 0;
        this._rebuildPending = false;
        this._buttons.forEach(button => button.destroy());
        this._buttons = [];
    }

    destroy() {
        this.clear();
    }
}
