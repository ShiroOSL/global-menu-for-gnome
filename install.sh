#!/bin/bash
set -e

UUID="globalmenu@ShiroOSL.github.io"
TARGET="$HOME/.local/share/gnome-shell/extensions/$UUID"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

rm -rf "$TARGET"
mkdir -p "$TARGET"

cp "$SOURCE"/*.js "$SOURCE/metadata.json" "$SOURCE/stylesheet.css" "$TARGET/"
cp "$SOURCE/uninstall.sh" "$SOURCE/logs.sh" "$TARGET/"
cp -r "$SOURCE/schemas" "$SOURCE/icons" "$TARGET/"

glib-compile-schemas "$TARGET/schemas/"

# the clipboard feature was removed, so drop the history it left in dconf
if command -v dconf >/dev/null 2>&1; then
    dconf reset /org/gnome/shell/extensions/globalmenu/clipboard-history || true
    dconf reset /org/gnome/shell/extensions/globalmenu/clipboard-clear-on-startup || true
fi

echo "Installed to $TARGET"
echo "Log out and back in to load the new version."
