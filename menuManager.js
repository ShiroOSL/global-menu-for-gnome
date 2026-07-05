import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, appInstance = null) {
      super._init(0.0, label);
      this._appInstance = appInstance;
      
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
                GLib.spawn_command_line_async(`gnome-software --details=${appId}`);
                return true;
            }
        }

        try {
            if (action === "open-finder" || action === "new-finder-win") {
                GLib.spawn_command_line_async(`xdg-open ${GLib.get_home_dir()}`);
                return true;
            } else if (action === "new-folder") {
                GLib.spawn_command_line_async(`mkdir -p ${GLib.get_home_dir()}/Desktop/'Untitled Folder'`);
                return true;
            } else if (action === "open-settings") {
                GLib.spawn_command_line_async("gnome-control-center");
                return true;
            } else if (action === "empty-bin") {
                GLib.spawn_command_line_async("gio trash --empty");
                return true;
            } else if (action === "open-system-help") {
                GLib.spawn_command_line_async("yelp");
                return true;
            }
        } catch (e) {
            console.error(`[globalmenu] Process execution error: ${e}`);
        }

        try {
            let seat = Clutter.get_default_backend().get_default_seat();
            let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            
            if (virtualDevice) {
                let modifierScanCode = 29; 
                let actionScanCode = 0;
                let useModifier = true;
                
                if (action === "copy") actionScanCode = 46;       
                else if (action === "paste") actionScanCode = 47;  
                else if (action === "cut") actionScanCode = 45;    
                else if (action === "undo") actionScanCode = 44;   
                else if (action === "redo") actionScanCode = 21;   
                else if (action === "select-all") actionScanCode = 30; 
                else if (action === "new-tab") actionScanCode = 28;    
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
                    actionScanCode = 111;  
                }
                else if (action === "virtual-open") {
                    useModifier = false;
                    actionScanCode = 28;   
                }
                else if (action === "properties") {
                    modifierScanCode = 56; 
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
            console.error(`[globalmenu] Virtual Keyboard error: ${e}`);
        }

        return false;
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
          if (item.action) {
            menuItem.connect("activate", () => {
              this._executeNativeAction(item.action);
            });
          }
          parentMenu.addMenuItem(menuItem);
        }
      }
    }
  }
);

export class MenuManager {
    constructor(uuid) {
        this.uuid = uuid;
        this._buttons = [];
        this._blacklist = ['gjs', 'org.gnome.gjs', 'gnome-shell', 'mutter', 'nautilus', 'org.gnome.nautilus'];
    }

    updateMenuForWindow(window) {
        this.clear();

        let appName = "Finder";
        let isAppFocused = false;
        let desktopId = "";
        let detectedApp = null;

        if (window) {
            let windowType = window.get_window_type();
            
            // Meta.WindowType.NORMAL is 0. Ignore notifications and background popups.
            if (windowType === 0) {
                let tracker = Shell.WindowTracker.get_default();
                detectedApp = tracker.get_window_app(window);
                
                let checkId = detectedApp ? (detectedApp.get_id() || "") : "";
                let checkName = detectedApp ? (detectedApp.get_name() || "") : "";
                let wmClass = window.get_wm_class() || "";
                let title = window.get_title() || "";

                // Group all identifiers into a single lowercase check to trap any gjs environment leaks
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
                { label: "About Finder", action: "about-finder" },
                { type: "separator" },
                { label: "Open Finder", action: "open-finder" },
                { label: "Settings", action: "open-settings" },
                { type: "separator" },
                { label: "Empty Bin...", action: "empty-bin" }
            ];
        }

        const menuData = [
            {
                type: "submenu",
                label: appName,
                children: firstMenuChildren
            },
            {
                type: "submenu",
                label: "File",
                children: [
                    { label: "New Finder Window", action: "new-finder-win" },
                    { label: "New Folder", action: "new-folder" },
                    { label: "New Tab", action: "new-tab" },
                    { label: "Open", action: "virtual-open" },
                    { type: "separator" },
                    { label: "Properties", action: "properties" },
                    { type: "separator" },
                    { label: "Close Window", action: "close" }
                ]
            },
            {
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
                    { label: "Select All", action: "select-all" }
                ]
            },
            {
                type: "submenu",
                label: "View",
                children: [
                    { label: "as Icons", action: "view-icons" },
                    { label: "as List", action: "view-list" }
                ]
            },
            {
                type: "submenu",
                label: "Go",
                children: [
                    { label: "Back", action: "go-back" },
                    { label: "Forward", action: "go-forward" }
                ]
            },
            {
                type: "submenu",
                label: "Window",
                children: [
                    { label: "Minimize", action: "minimize" },
                    { label: "Maximize", action: "maximize" },
                    { type: "separator" },
                    { label: "Close", action: "close" }
                ]
            },
            {
                type: "submenu",
                label: "Help",
                children: [
                    { label: "Help", action: "open-system-help" }
                ]
            }
        ];

        menuData.forEach((item, index) => {
            if (item.type === "submenu") {
                let btn = new TopLevelMenuButton(item.label, item.children, detectedApp);
                Main.panel.addToStatusArea(`${this.uuid}-${index}`, btn, index + 1, 'left');
                this._buttons.push(btn);
            }
        });
    }

    clear() {
        this._buttons.forEach(btn => btn.destroy());
        this._buttons = [];
    }

    destroy() {
        this.clear();
    }
}
