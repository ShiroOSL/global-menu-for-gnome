#!/usr/bin/env python3

import gi
gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib
import json
import os
import subprocess

BUS_NAME = "com.shiro.globalmenu"
OBJECT_PATH = "/com/shiro/globalmenu"
INTERFACE_NAME = "com.shiro.globalmenu.Menu"

INTROSPECTION_XML = """
<node>
  <interface name="com.shiro.globalmenu.Menu">
    <method name="RequestMenu">
      <arg type="s" name="menu_json" direction="out"/>
    </method>
    <method name="ActivateMenuItem">
      <arg type="s" name="action_id" direction="in"/>
      <arg type="b" name="success" direction="out"/>
    </method>
    <signal name="SendMenu">
      <arg type="s" name="menu_json"/>
    </signal>
  </interface>
</node>
"""

class GlobalMenuBackend:
    def __init__(self):
        self.node_info = Gio.DBusNodeInfo.new_for_xml(INTROSPECTION_XML)
        self.interface_info = self.node_info.interfaces[0]
        self.connection = None
        self.current_menu_json = "[]"

    def update_menu(self, menu_data):
        self.current_menu_json = json.dumps(menu_data)
        if self.connection:
            self.connection.emit_signal(
                None, OBJECT_PATH, INTERFACE_NAME, "SendMenu",
                GLib.Variant("(s)", (self.current_menu_json,))
            )

    def on_bus_acquired(self, connection, name):
        self.connection = connection
        connection.register_object(
            OBJECT_PATH, self.interface_info, self.handle_method_call, None, None
        )

    def handle_method_call(self, connection, sender, object_path, interface_name, method_name, parameters, invocation):
        if method_name == "RequestMenu":
            invocation.return_value(GLib.Variant("(s)", (self.current_menu_json,)))
        elif method_name == "ActivateMenuItem":
            action_id = parameters.unpack()[0]
            GLib.idle_add(self.execute_action_async, action_id)
            invocation.return_value(GLib.Variant("(b)", (True,)))

    def execute_action_async(self, action_id):
        try:
            if action_id == "open-finder":
                subprocess.Popen(["xdg-open", os.path.expanduser("~")])
            elif action_id == "new-finder-win":
                subprocess.Popen(["xdg-open", os.path.expanduser("~")])
            elif action_id == "new-folder":
                subprocess.Popen(["mkdir", "-p", os.path.expanduser("~/Desktop/Untitled Folder")])
            elif action_id == "open-settings":
                subprocess.Popen(["gnome-control-center"])
            elif action_id == "empty-bin":
                # This is the guaranteed native GNOME command
                subprocess.Popen(["gio", "trash", "--empty"])
            elif action_id == "new-tab":
                subprocess.Popen(["xdotool", "key", "ctrl+t"])
        except Exception as e:
            print(f"Error: {e}")
        return False

if __name__ == "__main__":
    backend = GlobalMenuBackend()
    
    def generate_menu():
        full_menu = [
            {"type": "submenu", "label": "Finder", "children": [
                {"type": "item", "label": "About Finder", "action": "about-finder"},
                {"type": "separator"},
                {"type": "item", "label": "Open Finder", "action": "open-finder"},
                {"type": "item", "label": "Settings", "action": "open-settings"},
                {"type": "separator"},
                {"type": "item", "label": "Empty Bin...", "action": "empty-bin"}
            ]},
            {"type": "submenu", "label": "File", "children": [
                {"type": "item", "label": "New Finder Window", "action": "new-finder-win"},
                {"type": "item", "label": "New Folder", "action": "new-folder"},
                {"type": "item", "label": "New Tab", "action": "new-tab"},
                {"type": "item", "label": "Open", "action": "virtual-open"},
                {"type": "separator"},
                {"type": "item", "label": "Properties", "action": "properties"},
                {"type": "separator"},
                {"type": "item", "label": "Close Window", "action": "close"}
            ]},
            {"type": "submenu", "label": "Edit", "children": [
                {"type": "item", "label": "Undo", "action": "undo"},
                {"type": "item", "label": "Redo", "action": "redo"},
                {"type": "separator"},
                {"type": "item", "label": "Cut", "action": "cut"},
                {"type": "item", "label": "Copy", "action": "copy"},
                {"type": "item", "label": "Paste", "action": "paste"},
                {"type": "item", "label": "Delete", "action": "delete-item"},
                {"type": "separator"},
                {"type": "item", "label": "Select All", "action": "select-all"}
            ]},
            {"type": "submenu", "label": "View", "children": [
                {"type": "item", "label": "as Icons", "action": "view-icons"},
                {"type": "item", "label": "as List", "action": "view-list"}
            ]},
            {"type": "submenu", "label": "Go", "children": [
                {"type": "item", "label": "Back", "action": "go-back"},
                {"type": "item", "label": "Forward", "action": "go-forward"}
            ]},
            {"type": "submenu", "label": "Window", "children": [
                {"type": "item", "label": "Minimize", "action": "minimize"},
                {"type": "item", "label": "Maximize", "action": "maximize"},
                {"type": "separator"},
                {"type": "item", "label": "Close", "action": "close"}
            ]}
        ]
        backend.update_menu(full_menu)
        return False

    GLib.timeout_add(1000, generate_menu)
    Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE, backend.on_bus_acquired, None, None)
    loop = GLib.MainLoop()
    loop.run()
