import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {debug} from './utils.js';

const MAX_APPS = 6;
const MAX_DOCUMENTS = 8;
const BOOKMARKS_PATH = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
const OPEN_KEYS = [Clutter.KEY_Right, Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space];

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const launchContext = () => global.create_app_launch_context(0, -1);

function loadFrequentApps(limit) {
    const apps = [];
    const seen = new Set();

    try {
        for (const app of Shell.AppUsage.get_default().get_most_used()) {
            const info = app.get_app_info();
            if (apps.length >= limit)
                break;
            if (!info || seen.has(app.get_id()))
                continue;

            seen.add(app.get_id());
            apps.push({
                label: info.get_display_name() || app.get_name() || app.get_id(),
                icon: app.get_icon() ?? info.get_icon(),
                info,
            });
        }
    } catch (e) {
        debug(`could not read application usage: ${e}`);
    }
    return apps;
}

const XML_ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};

const unescapeXml = text => text.replace(/&(amp|lt|gt|quot|apos);/g, (_all, name) => XML_ENTITIES[name]);

function tagAttribute(tag, name) {
    const marker = ` ${name}="`;
    const start = tag.indexOf(marker);
    if (start < 0)
        return null;

    const valueStart = start + marker.length;
    const valueEnd = tag.indexOf('"', valueStart);
    return valueEnd < 0 ? null : unescapeXml(tag.slice(valueStart, valueEnd));
}

function parseBookmarks(xml) {
    const byUri = new Map();

    for (const chunk of xml.split('<bookmark ').slice(1)) {
        const tagEnd = chunk.indexOf('>');
        if (tagEnd < 0)
            continue;

        const tag = ` ${chunk.slice(0, tagEnd)}`;
        const uri = tagAttribute(tag, 'href');
        if (!uri)
            continue;

        const stamp = Date.parse(tagAttribute(tag, 'modified') ?? '') || 0;

        let title = '';
        const titleStart = chunk.indexOf('<title>');
        const closing = chunk.indexOf('</bookmark>');
        if (titleStart >= 0 && (closing < 0 || titleStart < closing)) {
            const titleEnd = chunk.indexOf('</title>', titleStart);
            if (titleEnd > titleStart)
                title = unescapeXml(chunk.slice(titleStart + '<title>'.length, titleEnd)).trim();
        }

        if ((byUri.get(uri)?.stamp ?? -1) < stamp)
            byUri.set(uri, {uri, title, stamp});
    }

    return [...byUri.values()].sort((a, b) => b.stamp - a.stamp);
}

function describeDocument({uri, title}) {
    const file = Gio.File.new_for_uri(uri);
    let info = null;

    if (file.is_native()) {
        try {
            info = file.query_info(
                'standard::type,standard::icon,standard::display-name',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch (_e) {
            return null;
        }
    }

    return {
        uri,
        label: title || info?.get_display_name() || file.get_basename() || uri,
        icon: info?.get_icon() ?? null,
        isFolder: info?.get_file_type() === Gio.FileType.DIRECTORY,
    };
}

async function loadRecentDocuments(cancellable, limit) {
    let xml;
    try {
        const [contents] = await Gio.File.new_for_path(BOOKMARKS_PATH).load_contents_async(cancellable);
        xml = new TextDecoder().decode(contents);
    } catch (e) {
        debug(`could not read the recent documents list: ${e}`);
        return [];
    }

    const documents = [];
    for (const bookmark of parseBookmarks(xml)) {
        if (documents.length >= limit)
            break;

        const document = describeDocument(bookmark);
        if (document)
            documents.push(document);
    }
    return documents;
}

class RecentFlyout extends PopupMenu.PopupMenu {
    constructor(anchor) {
        super(anchor, 0.0, St.Side.RIGHT);
        this.actor.add_style_class_name('globalmenu-recent-flyout');
        this.actor.hide();
        Main.layoutManager.addTopChrome(this.actor);
    }

    showMessage(text) {
        this.removeAll();
        this.addMenuItem(new PopupMenu.PopupMenuItem(text, {reactive: false, can_focus: false}));
    }

    addHeading(text) {
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(text));
    }

    addEntry({label, icon, fallbackIcon, onActivate}) {
        const entry = new PopupMenu.PopupImageMenuItem(label, icon ?? fallbackIcon);
        entry.label.x_expand = true;
        entry.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        entry.connect('activate', onActivate);
        this.addMenuItem(entry);
    }

    dispose() {
        Main.layoutManager.removeChrome(this.actor);
        this.destroy();
    }
}

export const RecentItemsRow = GObject.registerClass(
class RecentItemsRow extends PopupMenu.PopupBaseMenuItem {
    _init(parentMenu, menuManager) {
        // activate: false, so a click doesn't close the System Menu
        super._init({activate: false, can_focus: true, hover: true});

        this._parentMenu = parentMenu;
        this._menuManager = menuManager;
        this._flyout = null;
        this._loading = null;

        this.add_child(new St.Icon({
            icon_name: 'document-open-recent-symbolic',
            style_class: 'popup-menu-icon',
        }));
        this.add_child(new St.Label({
            text: 'Recent Items',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this.add_child(PopupMenu.arrowIcon(St.Side.RIGHT));

        this.connectObject(
            'button-press-event', () => {
                this._toggleFlyout();
                return Clutter.EVENT_STOP;
            },
            'key-press-event', (_actor, event) => {
                if (!OPEN_KEYS.includes(event.get_key_symbol()))
                    return Clutter.EVENT_PROPAGATE;
                this._toggleFlyout();
                return Clutter.EVENT_STOP;
            },
            'destroy', () => this._dispose(),
            this);

        parentMenu.connectObject('open-state-changed', (_menu, isOpen) => {
            if (!isOpen)
                this._flyout?.close(false);
        }, this);
    }

    async _toggleFlyout() {
        try {
            if (this._flyout?.isOpen) {
                this._flyout.close(true);
                return;
            }

            if (!this._flyout) {
                this._flyout = new RecentFlyout(this);
                this._menuManager?.addMenu(this._flyout);
            }

            await this._refresh();
            this._flyout?.open(true);
        } catch (e) {
            debug(`recent items: ${e}`);
        }
    }

    async _refresh() {
        this._loading?.cancel();
        const token = new Gio.Cancellable();
        this._loading = token;
        const flyout = this._flyout;

        const apps = loadFrequentApps(MAX_APPS);
        const documents = await loadRecentDocuments(token, MAX_DOCUMENTS);
        if (token.is_cancelled() || this._flyout !== flyout)
            return;

        if (apps.length === 0 && documents.length === 0) {
            flyout.showMessage('No recent items');
            return;
        }

        flyout.removeAll();

        if (apps.length > 0) {
            flyout.addHeading('Applications');
            for (const app of apps) {
                flyout.addEntry({
                    label: app.label,
                    icon: app.icon,
                    fallbackIcon: 'application-x-executable-symbolic',
                    onActivate: () => this._runAndClose(
                        () => app.info.launch([], launchContext()),
                        'Could not launch application.'),
                });
            }
        }

        if (documents.length > 0) {
            flyout.addHeading('Documents');
            for (const document of documents) {
                flyout.addEntry({
                    label: document.label,
                    icon: document.icon,
                    fallbackIcon: document.isFolder ? 'folder-symbolic' : 'text-x-generic-symbolic',
                    onActivate: () => this._runAndClose(
                        () => Gio.AppInfo.launch_default_for_uri(document.uri, launchContext()),
                        'Could not open item.'),
                });
            }
        }

        flyout.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const clear = new PopupMenu.PopupMenuItem('Clear Menu');
        clear.connect('activate', () => this._clearHistory());
        flyout.addMenuItem(clear);
    }

    _runAndClose(task, failureMessage) {
        try {
            task();
        } catch (e) {
            Main.notify('Recent Items', failureMessage);
            debug(`${failureMessage} ${e}`);
        }
        this._parentMenu.close(true);
    }

    _clearHistory() {
        try {
            Gio.File.new_for_path(BOOKMARKS_PATH).delete(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                debug(`could not clear recent items: ${e}`);
        }
    }

    _dispose() {
        this._loading?.cancel();
        this._loading = null;

        if (this._flyout) {
            this._menuManager?.removeMenu(this._flyout);
            this._flyout.dispose();
            this._flyout = null;
        }
    }
});
