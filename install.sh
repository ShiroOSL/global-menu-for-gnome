#!/bin/bash

EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--------------------------------------------------"
echo "🚀 Starting installation of Global Menu for GNOME (V4)"
echo "--------------------------------------------------"

echo "🧹 Clearing old structures..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR"

echo "📄 Copying extension files..."
cp -rv "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/extension.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/menuManager.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/logs.sh" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/uninstall.sh" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/schemas" "$EXTENSION_DIR/"

echo "⚙️ Compiling GSettings schemas..."
glib-compile-schemas "$EXTENSION_DIR/schemas/"

echo "--------------------------------------------------"
echo "✅ Installation complete!"
echo "💡 Restart your desktop session (Logout/Login) to clear cache."
echo "--------------------------------------------------"
