import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children) {
      super._init(0.0, label);
      
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

        // 1. Direct System/Window Actions
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

        // 2. Original Python Process Sub-Launches
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
            }
        } catch (e) {
            console.error(`[globalmenu] Process execution error: ${e}`);
        }

        // 3. Virtual Keyboard Shortcuts Block
        try {
            let seat = Clutter.get_default_backend().get_default_seat();
            let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            
            if (virtualDevice) {
                let modifierScanCode = 29; // KEY_LEFTCTRL
                let actionScanCode = 0;
                let useModifier = true;
                
                if (action === "copy") actionScanCode = 46;       // KEY_C
                else if (action === "paste") actionScanCode = 47;  // KEY_V
                else if (action === "cut") actionScanCode = 45;    // KEY_X
                else if (action === "undo") actionScanCode = 44;   // KEY_Z
                else if (action === "redo") actionScanCode = 21;   // KEY_Y
                else if (action === "select-all") actionScanCode = 30; // KEY_A
                else if (action === "new-tab") actionScanCode = 28;    // KEY_T
                else if (action === "go-back") {
                    modifierScanCode = 56; // KEY_LEFTALT
                    actionScanCode = 105;  // KEY_LEFT
                }
                else if (action === "go-forward") {
                    modifierScanCode = 56; // KEY_LEFTALT
                    actionScanCode = 106;  // KEY_RIGHT
                }
                else if (action === "delete-item") {
                    useModifier = false;
                    actionScanCode = 111;  // KEY_DELETE
                }
                else if (action === "virtual-open") {
                    useModifier = false;
                    actionScanCode = 28;   // KEY_ENTER
                }
                else if (action === "properties") {
                    modifierScanCode = 56; // KEY_LEFTALT
                    actionScanCode = 28;   // KEY_ENTER
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
        this._loadStaticMenus();
    }

    _loadStaticMenus() {
        const menuData = [
            {
                type: "submenu",
                label: "Finder",
                children: [
                    { label: "About Finder", action: "about-finder" },
                    { type: "separator" },
                    { label: "Open Finder", action: "open-finder" },
                    { label: "Settings", action: "open-settings" },
                    { type: "separator" },
                    { label: "Empty Bin...", action: "empty-bin" }
                ]
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
            }
        ];

        menuData.forEach((item, index) => {
            if (item.type === "submenu") {
                let btn = new TopLevelMenuButton(item.label, item.children);
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
