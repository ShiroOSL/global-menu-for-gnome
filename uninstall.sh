#!/bin/bash

EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "--------------------------------------------------"
echo "🧹 Starting uninstallation of Global Menu V2"
echo "--------------------------------------------------"

echo "🚫 Disabling the extension..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null

echo "🗑️ Deleting extension directory..."
rm -rf "$EXTENSION_DIR"

echo "--------------------------------------------------"
echo "✅ Uninstallation complete!"
echo "--------------------------------------------------"
