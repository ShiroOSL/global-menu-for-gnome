#!/bin/bash

# Define variables
EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
DBUS_SERVICE_FILE="$HOME/.local/share/dbus-1/services/com.shiro.globalmenu.service"

echo "--------------------------------------------------"
echo "🧹 Starting uninstallation of Global Menu for GNOME"
echo "--------------------------------------------------"

# Disable the extension
echo "🚫 Disabling the extension..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null

# Terminate backend processes
echo "🛑 Terminating background Python backend processes..."
pkill -f "global_menu_backend.py"

# Remove files
echo "🗑️ Deleting extension directory..."
rm -rf "$EXTENSION_DIR"

echo "🗑️ Deleting D-Bus service file..."
rm -f "$DBUS_SERVICE_FILE"

echo "--------------------------------------------------"
echo "✅ Uninstallation complete!"
echo "--------------------------------------------------"
