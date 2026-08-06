import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Error logging is gated behind the "debug-logging" setting (off by
// default) so the extension doesn't spam the journal in normal use.
// MenuManager keeps this in sync with the setting; toggled live.
let debugLoggingEnabled = false;

function logError(message) {
    if (debugLoggingEnabled) console.error(message);
}

// Spawn a command safely using an argv array so no shell parsing/injection
// can occur, and so arguments with spaces or special characters are passed
// through intact.
function spawnCommand(argv) {
    try {
        GLib.spawn_async(
            null,
            argv,
            null,
            GLib.SpawnFlags.SEARCH_PATH,
            null
        );
    } catch (e) {
        logError(`[globalmenu] Failed to spawn '${argv.join(' ')}': ${e}`);
    }
}

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, appInstance = null) {
      super._init(0.0, label);
      this._appInstance = appInstance;
      this._timeoutIds = [];

      let title = new St.Label({
          text: label,
          y_align: Clutter.ActorAlign.CENTER,
          style_class: 'panel-button-label'
      });
      this.add_child(title);
      
      this._buildSubMenu(children, this.menu);
    }

    _executeNativeAction(action) {
        let display = global.display;
        let window = display.get_focus_window();

        if (action === "close") {
            if (window) window.delete(global.get_current_time());
            return true;
        } else if (action === "minimize") {
            if (window) window.minimize();
            return true;
        } else if (action === "maximize") {
            if (window) {
                if (window.is_maximized()) window.unmaximize();
                else window.maximize();
            }
            return true;
        }

        if (action.startsWith("custom-command:")) {
            let cmd = action.slice("custom-command:".length);
            try {
                let [, argv] = GLib.shell_parse_argv(cmd);
                spawnCommand(argv);
            } catch (e) {
                logError(`[globalmenu] Invalid custom command '${cmd}': ${e}`);
            }
            return true;
        }

        if (action.startsWith("custom-shortcut:")) {
            let accel = action.slice("custom-shortcut:".length);
            this._sendAccelerator(accel);
            return true;
        }

        if (action.startsWith("activate-window:")) {
            let winId = action.split(":")[1];
            if (this._appInstance) {
                let appWindows = this._appInstance.get_windows();
                let targetWin = appWindows.find(w => w.get_id().toString() === winId);
                if (targetWin) {
                    targetWin.activate(global.get_current_time());
                    return true;
                }
            }
            return false;
        }

        if (action === "new-app-window") {
            if (this._appInstance) {
                this._appInstance.open_new_window(-1);
                return true;
            }
            return false;
        }

        if (action.startsWith("app-details:")) {
            let appId = action.split(":")[1];
            if (appId) {
                spawnCommand(['gnome-software', `--details=${appId}`]);
                return true;
            }
        }

        try {
            if (action === "open-file-manager" || action === "new-file-manager-win" || action === "go-home") {
                spawnCommand(['xdg-open', GLib.get_home_dir()]);
                return true;
            } else if (action === "new-folder") {
                this._createNewFolder();
                return true;
            } else if (action === "open-settings") {
                spawnCommand(['gnome-control-center']);
                return true;
            } else if (action === "empty-bin") {
                spawnCommand(['gio', 'trash', '--empty']);
                return true;
            } else if (action === "open-system-help") {
                spawnCommand(['yelp']);
                return true;
            } else if (action === "go-recents") {
                spawnCommand(['xdg-open', 'recent:///']);
                return true;
            } else if (action === "go-documents") {
                let path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) || `${GLib.get_home_dir()}/Documents`;
                spawnCommand(['xdg-open', path]);
                return true;
            } else if (action === "go-desktop") {
                let path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP) || `${GLib.get_home_dir()}/Desktop`;
                spawnCommand(['xdg-open', path]);
                return true;
            } else if (action === "go-downloads") {
                let path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) || `${GLib.get_home_dir()}/Downloads`;
                spawnCommand(['xdg-open', path]);
                return true;
            }
        } catch (e) {
            logError(`[globalmenu] Process execution error: ${e}`);
        }

        try {
            let seat = Clutter.get_default_backend().get_default_seat();
            let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            
            if (virtualDevice) {
                if (action === "native-open-with") {
                    let timeUs = GLib.get_monotonic_time();
                    let shiftScanCode = 42; // Shift key
                    let f10ScanCode = 68;   // F10 key
                    let hScanCode = 35;     // 'h' key for mnemonic shortcut

                    // 1. Open context right-click popup menu on selection
                    virtualDevice.notify_key(timeUs, shiftScanCode, Clutter.KeyState.PRESSED);
                    virtualDevice.notify_key(timeUs + 10, f10ScanCode, Clutter.KeyState.PRESSED);
                    virtualDevice.notify_key(timeUs + 20, f10ScanCode, Clutter.KeyState.RELEASED);
                    virtualDevice.notify_key(timeUs + 30, shiftScanCode, Clutter.KeyState.RELEASED);

                    // 2. This button owns the timeout it creates and is responsible for
                    // clearing it in destroy().
                    let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                        let timeNow = GLib.get_monotonic_time();
                        virtualDevice.notify_key(timeNow, hScanCode, Clutter.KeyState.PRESSED);
                        virtualDevice.notify_key(timeNow + 10, hScanCode, Clutter.KeyState.RELEASED);

                        this._timeoutIds = this._timeoutIds.filter(id => id !== timeoutId);
                        return GLib.SOURCE_REMOVE;
                    });

                    this._timeoutIds.push(timeoutId);

                    return true;
                }

                let modifierScanCode = 29; // Ctrl
                let actionScanCode = 0;
                let useModifier = true;
                
                if (action === "copy") actionScanCode = 46;       
                else if (action === "paste") actionScanCode = 47;  
                else if (action === "cut") actionScanCode = 45;    
                else if (action === "undo") actionScanCode = 44;   
                else if (action === "redo") actionScanCode = 21;   
                else if (action === "select-all") actionScanCode = 30; 
                else if (action === "new-tab") actionScanCode = 28;    
                else if (action === "print") actionScanCode = 25; // Ctrl + P
                else if (action === "emoji-picker") actionScanCode = 52; // Ctrl + . (Period)
                else if (action === "toggle-fullscreen") {
                    useModifier = false;
                    actionScanCode = 87; // F11 key
                }
                else if (action === "go-back") {
                    modifierScanCode = 56; 
                    actionScanCode = 105;  
                }
                else if (action === "go-forward") {
                    modifierScanCode = 56; 
                    actionScanCode = 106;  
                }
                else if (action === "delete-item") {
                    useModifier = false;
                    actionScanCode = 111; // Delete key
                }
                else if (action === "virtual-open") {
                    useModifier = false;
                    actionScanCode = 28;   
                }
                else if (action === "properties") {
                    modifierScanCode = 56; // Alt + Enter (Get Info)
                    actionScanCode = 28;   
                }

                if (actionScanCode !== 0) {
                    let timeUs = GLib.get_monotonic_time();
                    if (useModifier) {
                        virtualDevice.notify_key(timeUs, modifierScanCode, Clutter.KeyState.PRESSED);
                        virtualDevice.notify_key(timeUs + 10, actionScanCode, Clutter.KeyState.PRESSED);
                        virtualDevice.notify_key(timeUs + 20, actionScanCode, Clutter.KeyState.RELEASED);
                        virtualDevice.notify_key(timeUs + 30, modifierScanCode, Clutter.KeyState.RELEASED);
                    } else {
                        virtualDevice.notify_key(timeUs, actionScanCode, Clutter.KeyState.PRESSED);
                        virtualDevice.notify_key(timeUs + 10, actionScanCode, Clutter.KeyState.RELEASED);
                    }
                    return true;
                }
            }
        } catch (e) {
            logError(`[globalmenu] Virtual Keyboard error: ${e}`);
        }

        return false;
    }

    // Sends an arbitrary GTK-style accelerator string (e.g. "<Control><Alt>t")
    // as a real key event, for user-defined custom shortcuts.
    _sendAccelerator(accel) {
        try {
            let [success, keyval, mods] = Clutter.accelerator_parse(accel);
            if (!success) {
                logError(`[globalmenu] Could not parse shortcut '${accel}'`);
                return;
            }

            let seat = Clutter.get_default_backend().get_default_seat();
            let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            if (!virtualDevice) return;

            let modKeyvals = [];
            if (mods & Clutter.ModifierType.CONTROL_MASK) modKeyvals.push(Clutter.KEY_Control_L);
            if (mods & Clutter.ModifierType.SHIFT_MASK) modKeyvals.push(Clutter.KEY_Shift_L);
            if (mods & Clutter.ModifierType.MOD1_MASK) modKeyvals.push(Clutter.KEY_Alt_L);
            if (mods & Clutter.ModifierType.SUPER_MASK) modKeyvals.push(Clutter.KEY_Super_L);

            let t = GLib.get_monotonic_time();
            modKeyvals.forEach(k => {
                virtualDevice.notify_keyval(t, k, Clutter.KeyState.PRESSED);
                t += 5;
            });
            virtualDevice.notify_keyval(t, keyval, Clutter.KeyState.PRESSED);
            t += 5;
            virtualDevice.notify_keyval(t, keyval, Clutter.KeyState.RELEASED);
            t += 5;
            modKeyvals.slice().reverse().forEach(k => {
                virtualDevice.notify_keyval(t, k, Clutter.KeyState.RELEASED);
                t += 5;
            });
        } catch (e) {
            logError(`[globalmenu] Failed to send accelerator '${accel}': ${e}`);
        }
    }

    _createNewFolder() {
        try {
            let desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP)
                || `${GLib.get_home_dir()}/Desktop`;
            let baseName = "Untitled Folder";
            let folderName = baseName;
            let counter = 2;
            let file = Gio.File.new_for_path(GLib.build_filenamev([desktopPath, folderName]));

            while (file.query_exists(null)) {
                folderName = `${baseName} ${counter}`;
                file = Gio.File.new_for_path(GLib.build_filenamev([desktopPath, folderName]));
                counter++;
            }

            file.make_directory(null);
        } catch (e) {
            logError(`[globalmenu] Failed to create new folder: ${e}`);
        }
    }

    _buildSubMenu(menuItems, parentMenu) {
      for (const item of menuItems) {
        if (item.type === "separator") {
          parentMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        } else if (item.type === "section-header") {
          let headerItem = new PopupMenu.PopupMenuItem(item.label, { activate: false });
          headerItem.setSensitive(false);
          headerItem.label.add_style_class_name('popup-subtitle-menu-item');
          parentMenu.addMenuItem(headerItem);
        } else if (item.type === "submenu") {
          const subMenu = new PopupMenu.PopupSubMenuMenuItem(item.label);
          this._buildSubMenu(item.children, subMenu.menu);
          parentMenu.addMenuItem(subMenu);
        } else {
          const menuItem = new PopupMenu.PopupMenuItem(item.label);
          if (item.enabled === false) {
            // Unimplemented placeholder item.
            menuItem.setSensitive(false);
          } else if (item.action) {
            menuItem.connect("activate", () => {
              this._executeNativeAction(item.action);
            });
          }
          parentMenu.addMenuItem(menuItem);
        }
      }
    }

    destroy() {
        if (this._timeoutIds && this._timeoutIds.length > 0) {
            this._timeoutIds.forEach(id => GLib.source_remove(id));
            this._timeoutIds = [];
        }
        super.destroy();
    }
  }
);

export class MenuManager {
    constructor(uuid, settings) {
        this.uuid = uuid;
        this._settings = settings;
        this._buttons = [];
        this._blacklist = ['gjs', 'org.gnome.gjs', 'gnome-shell', 'mutter', 'nautilus', 'org.gnome.nautilus'];

        debugLoggingEnabled = settings.get_boolean('debug-logging');
        this._debugLoggingChangedId = settings.connect('changed::debug-logging', () => {
            debugLoggingEnabled = settings.get_boolean('debug-logging');
        });
    }

    updateMenuForWindow(window) {
        let appName = this._settings.get_string('desktop-app-name') || 'Nautilus';
        let isAppFocused = false;
        let desktopId = "";
        let detectedApp = null;

        if (window) {
            let windowType = window.get_window_type();

            if (windowType === 0) {
                let tracker = Shell.WindowTracker.get_default();
                detectedApp = tracker.get_window_app(window);

                let checkId = detectedApp ? (detectedApp.get_id() || "") : "";
                let checkName = detectedApp ? (detectedApp.get_name() || "") : "";
                let wmClass = window.get_wm_class() || "";
                let title = window.get_title() || "";

                let combinedIdentifiers = `${checkId} ${checkName} ${wmClass} ${title}`.toLowerCase();

                let isBlacklisted = this._blacklist.some(item =>
                    combinedIdentifiers.includes(item.toLowerCase())
                );

                if (!isBlacklisted && (detectedApp || wmClass)) {
                    if (detectedApp) {
                        appName = detectedApp.get_name();
                        desktopId = detectedApp.get_id();
                        isAppFocused = true;
                    } else if (wmClass) {
                        appName = wmClass.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        desktopId = wmClass.toLowerCase() + ".desktop";
                        isAppFocused = true;
                    }
                } else {
                    detectedApp = null;
                }
            }
        }

        let desktopAppName = this._settings.get_string('desktop-app-name') || 'Nautilus';

        let firstMenuChildren = [];
        if (isAppFocused) {
            if (detectedApp) {
                let openWindows = detectedApp.get_windows();
                if (openWindows.length > 0) {
                    firstMenuChildren.push({ type: "section-header", label: "Open Windows" });
                    openWindows.forEach(win => {
                        firstMenuChildren.push({
                            label: win.get_title() || appName,
                            action: `activate-window:${win.get_id()}`
                        });
                    });
                    firstMenuChildren.push({ type: "separator" });
                }
            }
            firstMenuChildren.push(
                { label: "New Window", action: "new-app-window" },
                { type: "separator" },
                { label: "App Details", action: `app-details:${desktopId}` },
                { type: "separator" },
                { label: `Quit ${appName}`, action: "close" }
            );
        } else {
            firstMenuChildren = [
                { label: `About ${desktopAppName}`, enabled: false },
                { type: "separator" },
                { label: `Open ${desktopAppName}`, action: "open-file-manager" },
                { label: "Settings", action: "open-settings" },
                { type: "separator" },
                { label: "Empty Bin...", action: "empty-bin" }
            ];
        }

        const fileMenu = {
            type: "submenu",
            label: "File",
            children: [
                { label: `New ${desktopAppName} Window`, action: "new-file-manager-win" },
                { label: "New Folder", action: "new-folder" },
                { label: "New Tab", action: "new-tab" },
                { label: "Open", action: "virtual-open" },
                { label: "Open With", action: "native-open-with" },
                { label: "Print", action: "print" },
                { type: "separator" },
                { label: "Get Info", action: "properties" },
                { label: "Compress", enabled: false },
                { label: "Duplicate", enabled: false },
                { type: "separator" },
                { label: "Move to Trash", action: "delete-item" },
                { type: "separator" },
                { label: "Close Window", action: "close" }
            ]
        };

        const editMenu = {
            type: "submenu",
            label: "Edit",
            children: [
                { label: "Undo", action: "undo" },
                { label: "Redo", action: "redo" },
                { type: "separator" },
                { label: "Cut", action: "cut" },
                { label: "Copy", action: "copy" },
                { label: "Paste", action: "paste" },
                { label: "Delete", action: "delete-item" },
                { type: "separator" },
                { label: "Select All", action: "select-all" },
                { type: "separator" },
                { label: "Emoji & Symbols", action: "emoji-picker" }
            ]
        };

        const viewMenu = {
            type: "submenu",
            label: "View",
            children: [
                { label: "as Icons", enabled: false },
                { label: "as List", enabled: false },
                { type: "separator" },
                { label: "Enter Full Screen", action: "toggle-fullscreen" }
            ]
        };

        const goMenu = {
            type: "submenu",
            label: "Go",
            children: [
                { label: "Back", action: "go-back" },
                { label: "Forward", action: "go-forward" },
                { type: "separator" },
                { label: "Recents", action: "go-recents" },
                { label: "Documents", action: "go-documents" },
                { label: "Desktop", action: "go-desktop" },
                { label: "Downloads", action: "go-downloads" },
                { label: "Home", action: "go-home" }
            ]
        };

        const windowMenu = {
            type: "submenu",
            label: "Window",
            children: [
                { label: "Minimize", action: "minimize" },
                { label: "Maximize", action: "maximize" },
                { type: "separator" },
                { label: "Close", action: "close" }
            ]
        };

        const helpMenu = {
            type: "submenu",
            label: "Help",
            children: [
                { label: "GNOME Help", action: "open-system-help" }
            ]
        };

        let menuData = [];

        if (this._settings.get_boolean('menu-app-enabled')) {
            menuData.push({ type: "submenu", label: appName, children: firstMenuChildren });
        }

        if (this._settings.get_boolean('menu-file-enabled')) menuData.push(fileMenu);
        if (this._settings.get_boolean('menu-edit-enabled')) menuData.push(editMenu);
        if (this._settings.get_boolean('menu-view-enabled')) menuData.push(viewMenu);
        if (this._settings.get_boolean('menu-go-enabled')) menuData.push(goMenu);
        if (this._settings.get_boolean('menu-window-enabled')) menuData.push(windowMenu);
        if (this._settings.get_boolean('menu-help-enabled')) menuData.push(helpMenu);

        menuData.push(...this._buildCustomMenus());

        this.clear();

        menuData.forEach((item, index) => {
            let btn = new TopLevelMenuButton(item.label, item.children, detectedApp);
            Main.panel.addToStatusArea(`${this.uuid}-${index}`, btn, index + 1, 'left');
            this._buttons.push(btn);
        });
    }

    _buildCustomMenus() {
        let raw = this._settings.get_string('custom-menus') || '[]';
        let sections = [];
        try {
            sections = JSON.parse(raw);
        } catch (e) {
            sections = [];
        }

        return sections
            .filter(section => section && section.enabled !== false)
            .map(section => {
                let items = Array.isArray(section.items) ? section.items : [];
                let children = items
                    .filter(entry => entry && entry.value)
                    .map(entry => ({
                        label: entry.label || '(untitled)',
                        action: entry.kind === 'shortcut'
                            ? `custom-shortcut:${entry.value}`
                            : `custom-command:${entry.value}`,
                    }));

                if (children.length === 0) {
                    children.push({ label: 'No items configured', enabled: false });
                }

                return { type: "submenu", label: section.label || 'Custom', children };
            });
    }

    clear() {
        this._buttons.forEach(btn => btn.destroy());
        this._buttons = [];
    }

    destroy() {
        if (this._settings && this._debugLoggingChangedId) {
            this._settings.disconnect(this._debugLoggingChangedId);
            this._debugLoggingChangedId = null;
        }
        this.clear();
    }
}
