import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {RecentItemsRow} from './recentItems.js';
import {COMMAND_PRESETS, debug, spawnLine} from './utils.js';

const ICON_KEYS = [
    'logo-icon-name', 'logo-custom-icon-path', 'logo-distro-icon',
    'logo-distro-icon-symbolic', 'logo-icon-size',
];

const MENU_KEYS = [
    'hide-overview-button', 'show-app-grid', 'show-software-center', 'show-system-monitor',
    'show-terminal', 'show-extensions-app', 'show-force-quit', 'show-power-options',
    'show-lock-screen', 'show-log-out', 'system-menu-custom-items',
];

const TOOLS = [
    {
        flag: 'show-software-center', label: 'Software Center', icon: 'software-store-symbolic',
        commandKey: 'software-center-command', presets: COMMAND_PRESETS.softwareCenter,
    },
    {
        flag: 'show-system-monitor', label: 'System Monitor', icon: 'utilities-system-monitor-symbolic',
        commandKey: 'system-monitor-command', presets: COMMAND_PRESETS.systemMonitor,
    },
    {
        flag: 'show-terminal', label: 'Terminal', icon: 'utilities-terminal-symbolic',
        commandKey: 'terminal-command', presets: COMMAND_PRESETS.terminal,
    },
];

const EXTENSION_APP_IDS = ['org.gnome.Extensions.desktop', 'com.mattjakeman.ExtensionManager.desktop'];

function firstInstalled(commands) {
    return commands.filter(Boolean).find(command => {
        try {
            const [, argv] = GLib.shell_parse_argv(command);
            return Boolean(argv[0] && GLib.find_program_in_path(argv[0]));
        } catch (_e) {
            return false;
        }
    }) ?? null;
}

export const SystemMenuButton = GObject.registerClass(
class SystemMenuButton extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.5, 'System Menu');

        this._settings = settings;
        this._extensionPath = extensionPath;
        this._systemActions = SystemActions.getDefault();
        this._flyoutManager = new PopupMenu.PopupMenuManager(this);

        this._icon = new St.Icon({style_class: 'globalmenu-logo-icon system-status-icon'});
        this.add_child(this._icon);

        this._syncIcon();
        this._rebuildMenu();

        this._settings.connectObject('changed', (_settings, key) => {
            if (ICON_KEYS.includes(key))
                this._syncIcon();
            else if (MENU_KEYS.includes(key))
                this._rebuildMenu();
        }, this);
    }

    _bundledIcon(name) {
        const symbolic = this._settings.get_boolean('logo-distro-icon-symbolic');
        for (const variant of symbolic ? ['symbolic', 'color'] : ['color', 'symbolic']) {
            const path = GLib.build_filenamev([this._extensionPath, 'icons', `distro-${name}-${variant}.svg`]);
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                return path;
        }
        return null;
    }

    _syncIcon() {
        const size = this._settings.get_int('logo-icon-size');
        if (size > 0)
            this._icon.icon_size = size;

        const custom = this._settings.get_string('logo-custom-icon-path');
        const distro = this._settings.get_string('logo-distro-icon');
        const path = custom && GLib.file_test(custom, GLib.FileTest.EXISTS)
            ? custom
            : distro && this._bundledIcon(distro);

        if (path)
            this._icon.gicon = Gio.icon_new_for_string(path);
        else
            this._icon.icon_name = this._settings.get_string('logo-icon-name') || 'start-here-symbolic';
    }

    _rebuildMenu() {
        const on = key => this._settings.get_boolean(key);
        const hideOverview = on('hide-overview-button');
        const power = on('show-power-options');
        const lock = on('show-lock-screen');
        const logout = on('show-log-out');

        this.menu.removeAll();

        this._addItem('About This System', () => this._showAbout(), 'dialog-information-symbolic');
        this._addSeparator();
        this.menu.addMenuItem(new RecentItemsRow(this.menu, this._flyoutManager));
        this._addSeparator();

        if (hideOverview)
            this._addItem('Activities', () => Main.overview.toggle(), 'view-grid-symbolic');
        if (on('show-app-grid'))
            this._addItem('App Grid', () => this._showAppGrid(), 'view-app-grid-symbolic');
        if (hideOverview || on('show-app-grid'))
            this._addSeparator();

        for (const tool of TOOLS) {
            if (on(tool.flag))
                this._addItem(tool.label, () => this._launchTool(tool), tool.icon);
        }
        if (on('show-extensions-app'))
            this._addItem('Extensions', () => this._openExtensionsApp(), 'application-x-addon-symbolic');

        if (on('show-force-quit')) {
            this._addSeparator();
            this._addItem('Force Quit App', () => this._forceQuit(), 'process-stop-symbolic');
        }

        const custom = this._customItems();
        if (custom.length > 0) {
            this._addSeparator();
            for (const entry of custom)
                this._addItem(entry.label || '(untitled)', () => spawnLine(entry.value), 'system-run-symbolic');
        }

        if (power || lock || logout)
            this._addSeparator();
        if (power) {
            this._addItem('Sleep', () => this._systemActions.activateSuspend(), 'weather-clear-night-symbolic');
            this._addItem('Restart...', () => this._systemActions.activateRestart(), 'system-reboot-symbolic');
            this._addItem('Shut Down...', () => this._systemActions.activatePowerOff(), 'system-shutdown-symbolic');
        }
        if (power && (lock || logout))
            this._addSeparator();
        if (lock)
            this._addItem('Lock Screen', () => this._systemActions.activateLockScreen(), 'system-lock-screen-symbolic');
        if (logout)
            this._addItem('Log Out...', () => this._systemActions.activateLogout(), 'system-log-out-symbolic');
    }

    _addItem(label, onActivate, icon) {
        const item = new PopupMenu.PopupImageMenuItem(label, icon);
        item.connect('activate', onActivate);
        this.menu.addMenuItem(item);
    }

    _addSeparator() {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _customItems() {
        try {
            const items = JSON.parse(this._settings.get_string('system-menu-custom-items') || '[]');
            return Array.isArray(items) ? items.filter(item => item?.value) : [];
        } catch (_e) {
            return [];
        }
    }

    _launchTool({label, commandKey, presets}) {
        const command = firstInstalled([this._settings.get_string(commandKey), ...presets]);
        if (command)
            spawnLine(command);
        else
            Main.notify('System Menu', `No ${label} application found. Set one in Preferences.`);
    }

    // Runs in its own process: loading GTK4 into the Shell would clash with St/Clutter.
    _showAbout() {
        try {
            GLib.spawn_async(null, ['gjs', '-m', `${this._extensionPath}/systemInfoPanel.js`], null, GLib.SpawnFlags.SEARCH_PATH, null);
        } catch (e) {
            debug(`could not open the system info window: ${e}`);
            spawnLine('gnome-control-center system about');
        }
    }

    _showAppGrid() {
        Main.overview.dash.showAppsButton.checked = true;
        Main.overview.show();
    }

    _openExtensionsApp() {
        const apps = Shell.AppSystem.get_default();
        const preferred = this._settings.get_string('extensions-app-id') || EXTENSION_APP_IDS[0];
        const app = [preferred, ...EXTENSION_APP_IDS].map(id => apps.lookup_app(id)).find(Boolean);

        try {
            if (!app)
                throw new Error('not installed');
            app.activate();
        } catch (_e) {
            spawnLine('gnome-extensions-app');
        }
    }

    _forceQuit() {
        const window = global.display.get_focus_window();
        if (!window) {
            Main.notify('Force Quit', 'No focused window to quit.');
            return;
        }

        try {
            window.kill();
        } catch (e) {
            debug(`force quit failed: ${e}`);
        }
    }
});
