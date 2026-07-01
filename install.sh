#!/bin/bash

# Define variables
EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--------------------------------------------------"
echo "🚀 Starting installation of Global Menu for GNOME (V2 Native)"
echo "--------------------------------------------------"

# Create target directory
echo "📂 Creating target directory..."
mkdir -p "$EXTENSION_DIR"

# Copy source files (excluding Python backend and D-Bus service)
echo "📄 Copying extension files..."
cp -rv "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/extension.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/menuManager.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/schemas" "$EXTENSION_DIR/"

# Compile GSettings schemas natively
echo "⚙️ Compiling GSettings schemas..."
glib-compile-schemas "$EXTENSION_DIR/schemas/"

echo "--------------------------------------------------"
echo "✅ Installation complete!"
echo "💡 Restart GNOME Shell (or logout/login on Wayland)"
echo "💡 Enable with: gnome-extensions enable $EXTENSION_UUID"
echo "--------------------------------------------------"
