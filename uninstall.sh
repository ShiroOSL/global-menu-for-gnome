#!/bin/bash

UUID="globalmenu@ShiroOSL.github.io"

gnome-extensions disable "$UUID" 2>/dev/null
rm -rf "$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Global Menu removed."
