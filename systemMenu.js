import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

function spawnCommandLine(commandLine) {
    try {
        let [, argv] = GLib.shell_parse_argv(commandLine);
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (e) {
        console.error(`[globalmenu] Failed to launch '${commandLine}': ${e}`);
    }
}

// Returns the first command (configured choice first, then fallbacks) whose
// executable actually exists on this system, or null if none do.
function findAvailableCommand(preferred, fallbacks) {
    let candidates = [preferred, ...fallbacks].filter(Boolean);
    for (let cmd of candidates) {
        try {
            let [, argv] = GLib.shell_parse_argv(cmd);
            if (argv && argv[0] && GLib.find_program_in_path(argv[0]))
                return cmd;
        } catch (e) {
            // Malformed command string; skip it.
        }
    }
    return null;
}

const TERMINAL_FALLBACKS = ['ptyxis', 'gnome-terminal', 'kgx', 'konsole', 'kitty', 'alacritty', 'tilix', 'terminator', 'xterm'];
const SOFTWARE_CENTER_FALLBACKS = ['gnome-software', 'plasma-discover', 'pamac-manager', 'snap-store'];
const SYSTEM_MONITOR_FALLBACKS = ['gnome-system-monitor', 'resources', 'ksysguard', 'xfce4-taskmanager'];

export const SystemMenuButton = GObject.registerClass(
  class SystemMenuButton extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.5, 'System Menu');

        this._settings = settings;
        this._extensionPath = extensionPath;

        this._icon = new St.Icon({
            style_class: 'globalmenu-logo-icon system-status-icon',
        });
        this.add_child(this._icon);

        this._syncIcon();
        this._rebuildMenu();

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (['logo-icon-name', 'logo-custom-icon-path', 'logo-distro-icon',
                 'logo-distro-icon-symbolic', 'logo-icon-size'].includes(key)) {
                this._syncIcon();
            } else if (['hide-overview-button', 'show-app-grid', 'show-software-center',
                        'show-system-monitor', 'show-terminal', 'show-extensions-app',
                        'show-force-quit', 'show-power-options', 'show-lock-screen',
                        'show-log-out', 'system-menu-custom-items'].includes(key)) {
                this._rebuildMenu();
            }
        });

        this.connect('destroy', () => this._onDestroy());
    }

    _syncIcon() {
        let size = this._settings.get_int('logo-icon-size');
        if (size > 0) this._icon.icon_size = size;

        let customPath = this._settings.get_string('logo-custom-icon-path');
        if (customPath) {
            let file = Gio.File.new_for_path(customPath);
            if (file.query_exists(null)) {
                this._icon.gicon = Gio.icon_new_for_string(customPath);
                return;
            }
        }

        let distroIcon = this._settings.get_string('logo-distro-icon');
        if (distroIcon) {
            let variant = this._settings.get_boolean('logo-distro-icon-symbolic') ? 'symbolic' : 'color';
            let bundledPath = GLib.build_filenamev([this._extensionPath, 'icons', `distro-${distroIcon}-${variant}.svg`]);
            let file = Gio.File.new_for_path(bundledPath);
            if (!file.query_exists(null)) {
                // Fall back to the other variant if this distro doesn't
                // ship the requested one (e.g. GNOME has color only).
                let otherVariant = variant === 'symbolic' ? 'color' : 'symbolic';
                bundledPath = GLib.build_filenamev([this._extensionPath, 'icons', `distro-${distroIcon}-${otherVariant}.svg`]);
                file = Gio.File.new_for_path(bundledPath);
            }
            if (file.query_exists(null)) {
                this._icon.gicon = Gio.icon_new_for_string(bundledPath);
                return;
            }
        }

        let iconName = this._settings.get_string('logo-icon-name') || 'start-here-symbolic';
        this._icon.icon_name = iconName;
    }

    _rebuildMenu() {
        this.menu.removeAll();

        const hideOverview = this._settings.get_boolean('hide-overview-button');
        const showAppGrid = this._settings.get_boolean('show-app-grid');
        const showSoftwareCenter = this._settings.get_boolean('show-software-center');
        const showSystemMonitor = this._settings.get_boolean('show-system-monitor');
        const showTerminal = this._settings.get_boolean('show-terminal');
        const showExtensionsApp = this._settings.get_boolean('show-extensions-app');
        const showForceQuit = this._settings.get_boolean('show-force-quit');
        const showPowerOptions = this._settings.get_boolean('show-power-options');
        const showLockScreen = this._settings.get_boolean('show-lock-screen');
        const showLogOut = this._settings.get_boolean('show-log-out');

        this._addItem('About This System', () => this._aboutThisSystem());
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Only offer an "Activities" menu entry when the real panel button
        // is hidden, so overview access is never lost entirely.
        if (hideOverview)
            this._addItem('Activities', () => Main.overview.toggle());

        if (showAppGrid)
            this._addItem('App Grid', () => this._showAppGrid());

        if (hideOverview || showAppGrid)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (showSoftwareCenter)
            this._addItem('Software Center', () => this._launchOrNotify('software-center-command', SOFTWARE_CENTER_FALLBACKS, 'Software Center'));
        if (showSystemMonitor)
            this._addItem('System Monitor', () => this._launchOrNotify('system-monitor-command', SYSTEM_MONITOR_FALLBACKS, 'System Monitor'));
        if (showTerminal)
            this._addItem('Terminal', () => this._launchOrNotify('terminal-command', TERMINAL_FALLBACKS, 'Terminal'));
        if (showExtensionsApp)
            this._addItem('Extensions', () => this._openExtensionsApp());

        if (showForceQuit) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addItem('Force Quit App', () => this._forceQuit());
        }

        let customItems = this._loadCustomItems();
        if (customItems.length > 0) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            customItems.forEach(item => {
                this._addItem(item.label || '(untitled)', () => spawnCommandLine(item.value));
            });
        }

        if (showPowerOptions || showLockScreen || showLogOut)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (showPowerOptions) {
            this._addItem('Sleep', () => spawnCommandLine('systemctl suspend'));
            this._addItem('Restart...', () => spawnCommandLine('gnome-session-quit --reboot'));
            this._addItem('Shut Down...', () => spawnCommandLine('gnome-session-quit --power-off'));
        }

        if (showLockScreen)
            this._addItem('Lock Screen', () => spawnCommandLine('loginctl lock-session'));

        if (showLogOut)
            this._addItem('Log Out...', () => spawnCommandLine('gnome-session-quit --logout'));
    }

    _addItem(label, activateFunction) {
        let item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', activateFunction);
        this.menu.addMenuItem(item);
        return item;
    }

    _loadCustomItems() {
        try {
            let items = JSON.parse(this._settings.get_string('system-menu-custom-items') || '[]');
            return Array.isArray(items) ? items.filter(item => item && item.value) : [];
        } catch (e) {
            return [];
        }
    }

    _launchOrNotify(settingKey, fallbacks, label) {
        let configured = this._settings.get_string(settingKey);
        let resolved = findAvailableCommand(configured, fallbacks);
        if (resolved) {
            spawnCommandLine(resolved);
        } else {
            Main.notify('System Menu', `No ${label} application found. Set one in Preferences.`);
        }
    }

    _aboutThisSystem() {
        spawnCommandLine('gnome-control-center system about');
    }

    _showAppGrid() {
        Main.overview.dash.showAppsButton.checked = true;
        Main.overview.show();
    }

    _openExtensionsApp() {
        let appSys = Shell.AppSystem.get_default();
        let preferredId = this._settings.get_string('extensions-app-id') || 'org.gnome.Extensions.desktop';
        let app = appSys.lookup_app(preferredId) ||
                  appSys.lookup_app('org.gnome.Extensions.desktop') ||
                  appSys.lookup_app('com.mattjakeman.ExtensionManager.desktop');
        if (app) {
            try {
                app.activate();
            } catch (e) {
                spawnCommandLine('gnome-extensions-app');
            }
        } else {
            spawnCommandLine('gnome-extensions-app');
        }
    }

    _forceQuit() {
        let window = global.display.get_focus_window();
        if (!window) {
            Main.notify('Force Quit', 'No focused window to quit.');
            return;
        }
        try {
            window.kill();
        } catch (e) {
            console.error(`[globalmenu] Force Quit failed: ${e}`);
        }
    }

    _onDestroy() {
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
    }
  }
);
