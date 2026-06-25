#!/bin/bash

# Define variables
EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
DBUS_SERVICE_DIR="$HOME/.local/share/dbus-1/services"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--------------------------------------------------"
echo "🚀 Starting installation of Global Menu for GNOME"
echo "--------------------------------------------------"

# Create target directories
echo "📂 Creating target directories..."
mkdir -p "$EXTENSION_DIR"
mkdir -p "$DBUS_SERVICE_DIR"

# Copy source files
echo "📄 Copying extension files..."
cp -rv "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/extension.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/menuManager.js" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/schemas" "$EXTENSION_DIR/"
cp -rv "$SOURCE_DIR/backend" "$EXTENSION_DIR/"

# Install DBus service file directly
echo "⚙️ Installing D-Bus service file for auto-activation..."
cp -v "$SOURCE_DIR/com.shiro.globalmenu.service" "$DBUS_SERVICE_DIR/com.shiro.globalmenu.service"

# Compile GSettings schemas
echo "⚙️ Compiling GSettings schemas..."
glib-compile-schemas "$EXTENSION_DIR/schemas/"

# Set executable permissions
echo "🔑 Setting permissions..."
chmod +x "$EXTENSION_DIR/backend/global_menu_backend.py"

# Start backend manually for the first time (optional, as DBus will auto-activate)
echo "🔄 Starting backend service..."
pkill -f "global_menu_backend.py"
python3 "$EXTENSION_DIR/backend/global_menu_backend.py" &

echo "--------------------------------------------------"
echo "✅ Installation complete!"
echo "💡 Restart GNOME Shell (or logout/login on Wayland)"
echo "💡 Enable with: gnome-extensions enable $EXTENSION_UUID"
echo "--------------------------------------------------"
