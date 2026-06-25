import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const DBUS_SERVICE_NAME = "com.shiro.globalmenu";
const DBUS_OBJECT_PATH = "/com/shiro/globalmenu";
const DBUS_INTERFACE_NAME = "com.shiro.globalmenu.Menu";

const MenuInterfaceXML = `
<node>
  <interface name="${DBUS_INTERFACE_NAME}">
    <method name="RequestMenu">
      <arg type="s" name="menu_json" direction="out"/>
    </method>
    <method name="ActivateMenuItem">
      <arg type="s" name="action_id" direction="in"/>
    </method>
    <signal name="SendMenu">
      <arg type="s" name="menu_json"/>
    </signal>
  </interface>
</node>
`;

const TopLevelMenuButton = GObject.registerClass(
  class TopLevelMenuButton extends PanelMenu.Button {
    _init(label, children, dbusProxy) {
      super._init(0.0, label);
      this._dbus = dbusProxy;
      
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
        
        if (!window) return false;

        if (action === "close") {
            window.delete(global.get_current_time());
            return true;
        } else if (action === "minimize") {
            window.minimize();
            return true;
        } else if (action === "maximize") {
            if (window.is_maximized()) {
                window.unmaximize();
            } else {
                window.maximize();
            }
            return true;
        }
        
        // Native Keyboard Injections Block
        let nativeActions = ["copy", "paste", "cut", "undo", "redo", "select-all", "go-back", "go-forward", "delete-item", "new-tab", "virtual-open", "properties"];
        if (nativeActions.includes(action)) {
            try {
                let seat = Clutter.get_default_backend().get_default_seat();
                let virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
                
                if (virtualDevice) {
                    let modifierScanCode = 29; // Default KEY_LEFTCTRL
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
                console.error(`[globalmenu@shiro.com] Virtual Device error: ${e}`);
            }
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
              if (this._executeNativeAction(item.action)) {
                  return;
              }
              try {
                  this._dbus.ActivateMenuItemRemote(item.action);
              } catch (e) {
                  console.error(`[globalmenu@shiro.com] Action error: ${e}`);
              }
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
        this._dbus = null;
        this._initDBus();
    }

    _initDBus() {
        this._dbus = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            Gio.DBusInterfaceInfo.new_for_xml(MenuInterfaceXML),
            DBUS_SERVICE_NAME,
            DBUS_OBJECT_PATH,
            DBUS_INTERFACE_NAME,
            null
        );

        if (this._dbus) {
            this._dbus.connectSignal("SendMenu", (proxy, sender, [menuJson]) => {
                this._onSendMenu(menuJson);
            });
            
            try {
                this._dbus.RequestMenuRemote((result, error) => {
                    if (result && result.length > 0) {
                        this._onSendMenu(result[0]);
                    }
                });
            } catch (e) {
                console.error(`[globalmenu@shiro.com] Initial RequestMenu failed: ${e}`);
            }
        }
    }

    _onSendMenu(menuJson) {
        this.clear();
        try {
            const menuData = JSON.parse(menuJson);
            menuData.forEach((item, index) => {
                if (item.type === "submenu") {
                    let btn = new TopLevelMenuButton(item.label, item.children, this._dbus);
                    Main.panel.addToStatusArea(`${this.uuid}-${index}`, btn, index + 1, 'left');
                    this._buttons.push(btn);
                }
            });
        } catch (e) {
            console.error(`[globalmenu@shiro.com] Failed to parse menu JSON: ${e}`);
        }
    }

    clear() {
        this._buttons.forEach(btn => btn.destroy());
        this._buttons = [];
    }

    destroy() {
        this.clear();
        this._dbus = null;
    }
}
