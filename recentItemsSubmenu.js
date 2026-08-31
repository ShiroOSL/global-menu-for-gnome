/*
 * recentItemsSubmenu.js - "Recent Items" side-flyout for Global Menu's
 * System Menu. Shows recently used applications and documents, backed by
 * GNOME's own app-usage tracking and the recently-used.xbel bookmark file.
 *
 * Built as a real PopupMenu.PopupMenu anchored to the right of its
 * trigger row (the same technique Kiwi Menu uses for its Recent Items
 * flyout), rather than a PopupSubMenuMenuItem — a PopupSubMenu nested
 * inside another open popup menu doesn't reliably render as a proper
 * side flyout under every shell theme, but a standalone PopupMenu with
 * St.Side.RIGHT does.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

const FILES_RECENT_LIMIT = 8;
const APPLICATIONS_RECENT_LIMIT = 6;
const RECENT_ITEMS_FILE = GLib.build_filenamev([
    GLib.get_user_data_dir(),
    'recently-used.xbel',
]);

Gio._promisify(Gio.File.prototype, 'load_bytes_async');

// Error logging is gated behind the extension's "debug-logging" setting
// (off by default), matching menuManager.js, so normal use doesn't spam
// the journal. setDebugLogging() is called once from systemMenu.js.
let debugLoggingEnabled = false;

export function setDebugLogging(enabled) {
    debugLoggingEnabled = enabled;
}

function logError(message) {
    if (debugLoggingEnabled) console.error(message);
}

async function loadFileTextAsync(file, cancellable) {
    const [bytes] = await file.load_bytes_async(cancellable);
    return new TextDecoder().decode(bytes.get_data());
}

async function getRecentApplications(limit) {
    let applications = [];
    if (!Shell?.AppUsage?.get_default) return applications;

    try {
        let usage = Shell.AppUsage.get_default();
        if (!usage || typeof usage.get_most_used !== 'function') return applications;

        let appSystem = Shell.AppSystem.get_default();
        let seen = new Set();
        let candidates = usage.get_most_used() || [];

        for (const app of candidates) {
            if (applications.length >= limit) break;
            if (!app || typeof app.get_id !== 'function') continue;

            let desktopId = app.get_id();
            if (!desktopId || seen.has(desktopId)) continue;
            seen.add(desktopId);

            let appInfo = app.get_app_info() ?? appSystem.lookup_app(desktopId)?.get_app_info();
            if (!appInfo) continue;

            let title = appInfo.get_display_name() ?? appInfo.get_name() ?? app.get_name() ?? desktopId;
            let gicon = app.get_icon() ?? appInfo.get_icon() ?? null;

            applications.push({ title, appInfo, gicon });
        }
    } catch (e) {
        logError(`[globalmenu] Failed to resolve recent applications: ${e}`);
    }

    return applications;
}

async function getRecentFiles(cancellable) {
    let file = Gio.File.new_for_path(RECENT_ITEMS_FILE);
    if (!file.query_exists(null)) return [];

    let text;
    try {
        text = await loadFileTextAsync(file, cancellable);
    } catch (e) {
        logError(`[globalmenu] Failed to read recent items list: ${e}`);
        return [];
    }

    let regex = /<bookmark[^>]*href="([^"]+)"[^>]*modified="([^"]+)"[^>]*>([\s\S]*?<title>([^<]*)<\/title>)?/g;
    let items = [];
    let seenUris = new Set();
    let match;

    while ((match = regex.exec(text)) !== null) {
        let uri = match[1];
        let modified = match[2];
        let titleMarkup = match[4] ?? '';

        if (seenUris.has(uri)) continue;
        seenUris.add(uri);

        let timestamp = 0;
        try {
            let dateTime = GLib.DateTime.new_from_iso8601(modified, null);
            if (dateTime) timestamp = dateTime.to_unix();
        } catch (e) {
            // Skip unparseable timestamps; item still gets listed at position 0.
        }

        let title = titleMarkup.trim();
        if (!title) {
            let decodedUri = GLib.uri_unescape_string(uri, null) ?? uri;
            title = decodedUri.startsWith('file://')
                ? GLib.path_get_basename(decodedUri.substring('file://'.length))
                : decodedUri;
        }

        let isDirectory = false;
        if (uri.startsWith('file://')) {
            try {
                let filePath = uri.substring('file://'.length);
                let f = Gio.File.new_for_path(filePath);
                if (f.query_exists(null)) {
                    let fileInfo = f.query_info('standard::type', Gio.FileQueryInfoFlags.NONE, null);
                    isDirectory = fileInfo.get_file_type() === Gio.FileType.DIRECTORY;
                }
            } catch (e) {
                isDirectory = false;
            }
        }

        items.push({ title, uri, timestamp, isDirectory });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
}

function getRecentFileIcon(uri, isDirectory) {
    if (!uri || !uri.startsWith('file://')) return null;
    try {
        let file = Gio.File.new_for_uri(uri);
        if (!file.query_exists(null)) return null;
        let info = file.query_info('standard::icon,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        if (info) return info.get_icon() ?? null;
    } catch (e) {
        // Fall back to themed icon below.
    }
    return isDirectory ? new Gio.ThemedIcon({ names: ['folder-symbolic'] }) : null;
}

// A menu row that, when activated, opens a real side-flyout PopupMenu
// (anchored to the right of this row, like a native submenu) listing
// recently used applications and documents.
export const RecentItemsSubmenu = GObject.registerClass(
class RecentItemsSubmenu extends PopupMenu.PopupBaseMenuItem {
    _init(parentMenu, menuManager) {
        super._init({ reactive: true, can_focus: true, hover: true });

        this._parentMenu = parentMenu;
        this._menuManager = menuManager;
        this._flyout = null;
        this._cancellable = null;
        this._parentCloseId = 0;

        let icon = new St.Icon({
            icon_name: 'document-open-recent-symbolic',
            style_class: 'popup-menu-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(icon);

        let label = new St.Label({
            text: 'Recent Items',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);

        let arrow = new St.Icon({
            icon_name: 'go-next-symbolic',
            style_class: 'popup-menu-arrow',
            y_align: Clutter.ActorAlign.CENTER,
            icon_size: 12,
        });
        this.add_child(arrow);

        // Open on button-press directly and stop the event there — this
        // is what actually prevents PopupMenuBase's default close-parent-
        // on-click behavior (which normally runs from the 'activate'
        // signal chain), rather than any '{ activate: false }' init flag.
        this.connect('button-press-event', () => {
            this._openFlyout().catch(e => logError(`[globalmenu] Recent Items: ${e}`));
            return Clutter.EVENT_STOP;
        });

        // Keyboard accessibility (Enter/Space while focused) still goes
        // through 'activate'.
        this.connect('activate', () => {
            this._openFlyout().catch(e => logError(`[globalmenu] Recent Items: ${e}`));
        });

        this.connect('destroy', () => this._destroyFlyout());
    }

    async _openFlyout() {
        if (!this._flyout) {
            this._flyout = new PopupMenu.PopupMenu(this, 0.0, St.Side.RIGHT);
            this._flyout.actor.add_style_class_name('globalmenu-recent-flyout');
            Main.layoutManager.addTopChrome(this._flyout.actor);
            this._flyout.actor.hide();

            if (this._menuManager) this._menuManager.addMenu(this._flyout);

            // Closing the parent System Menu should always take this
            // flyout down with it.
            this._parentCloseId = this._parentMenu.connect('open-state-changed', (_menu, isOpen) => {
                if (!isOpen && this._flyout) this._flyout.close(false);
            });
        }

        await this._populate();
        this._flyout.open(true);
    }

    async _populate() {
        if (!this._flyout) return;
        this._flyout.removeAll();

        if (this._cancellable) this._cancellable.cancel();
        this._cancellable = new Gio.Cancellable();
        let cancellable = this._cancellable;

        let loading = new PopupMenu.PopupMenuItem('Loading…', { reactive: false, can_focus: false });
        this._flyout.addMenuItem(loading);

        let [applications, files] = await Promise.all([
            getRecentApplications(APPLICATIONS_RECENT_LIMIT),
            getRecentFiles(cancellable),
        ]);

        if (cancellable.is_cancelled() || !this._flyout) return;

        files = files.slice(0, FILES_RECENT_LIMIT);
        this._flyout.removeAll();

        let hasApplications = applications.length > 0;
        let hasFiles = files.length > 0;

        if (!hasApplications && !hasFiles) {
            let empty = new PopupMenu.PopupMenuItem('No recent items', { reactive: false, can_focus: false });
            this._flyout.addMenuItem(empty);
            return;
        }

        let hasEntries = false;

        if (hasApplications) {
            this._flyout.addMenuItem(this._makeSectionHeader('Applications'));
            applications.forEach(({ title, appInfo, gicon }) => {
                let item = this._makeRow(title, gicon, 'application-x-executable-symbolic');
                item.connect('activate', () => this._launchApplication(appInfo));
                this._flyout.addMenuItem(item);
            });
            hasEntries = true;
        }

        if (hasFiles) {
            if (hasEntries) this._flyout.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._flyout.addMenuItem(this._makeSectionHeader('Documents'));
            files.forEach(({ title, uri, isDirectory }) => {
                let icon = getRecentFileIcon(uri, isDirectory);
                let item = this._makeRow(title, icon, isDirectory ? 'folder-symbolic' : 'text-x-generic-symbolic');
                item.connect('activate', () => this._launchUri(uri));
                this._flyout.addMenuItem(item);
            });
            hasEntries = true;
        }

        if (hasEntries) {
            this._flyout.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            let clearItem = new PopupMenu.PopupMenuItem('Clear Menu');
            clearItem.connect('activate', () => this._clearRecentItems());
            this._flyout.addMenuItem(clearItem);
        }
    }

    _makeSectionHeader(text) {
        let header = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        header.add_child(new St.Label({
            text,
            style_class: 'popup-section-header-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return header;
    }

    _makeRow(labelText, gicon, fallbackIconName) {
        let item = new PopupMenu.PopupMenuItem('');
        let iconProps = { style_class: 'popup-menu-icon', y_align: Clutter.ActorAlign.CENTER };
        if (gicon) iconProps.gicon = gicon;
        else iconProps.icon_name = fallbackIconName;
        item.insert_child_at_index(new St.Icon(iconProps), 0);

        if (item.label) {
            item.label.text = labelText;
            item.label.x_expand = true;
            item.label.clutter_text.set_ellipsize(3); // PANGO_ELLIPSIZE_END
        } else {
            let label = new St.Label({ text: labelText, x_expand: true });
            label.clutter_text.set_ellipsize(3);
            item.add_child(label);
        }
        return item;
    }

    _launchUri(uri) {
        if (!uri) return;
        try {
            let context = global.create_app_launch_context(0, -1);
            Gio.AppInfo.launch_default_for_uri(uri, context);
        } catch (e) {
            Main.notify('Recent Items', 'Could not open item.');
            logError(`[globalmenu] Failed to open recent item ${uri}: ${e}`);
        } finally {
            this._parentMenu.close(true);
        }
    }

    _launchApplication(appInfo) {
        if (!appInfo) return;
        try {
            let context = global.create_app_launch_context(0, -1);
            if (typeof appInfo.launch === 'function') appInfo.launch([], context);
        } catch (e) {
            Main.notify('Recent Items', 'Could not launch application.');
            logError(`[globalmenu] Failed to launch recent application: ${e}`);
        } finally {
            this._parentMenu.close(true);
        }
    }

    _clearRecentItems() {
        let file = Gio.File.new_for_path(RECENT_ITEMS_FILE);
        try {
            if (file.query_exists(null)) file.delete(null);
        } catch (e) {
            logError(`[globalmenu] Failed to clear recent items: ${e}`);
        }
        this._populate().catch(err => logError(`[globalmenu] Recent Items: ${err}`));
    }

    _destroyFlyout() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        if (this._parentCloseId) {
            this._parentMenu.disconnect(this._parentCloseId);
            this._parentCloseId = 0;
        }
        if (this._flyout) {
            if (this._menuManager) this._menuManager.removeMenu(this._flyout);
            Main.layoutManager.removeChrome(this._flyout.actor);
            this._flyout.destroy();
            this._flyout = null;
        }
    }
});
