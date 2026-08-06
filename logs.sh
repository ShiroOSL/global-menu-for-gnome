#!/bin/bash

EXTENSION_UUID="globalmenu@ShiroOSL.github.io"
LOG_FILE="testing.log"

echo "--------------------------------------------------"
echo "📋 Starting live logging for Global manu for gnome"
echo "📝 Logs will be piped to: $LOG_FILE"
echo "--------------------------------------------------"

journalctl /usr/bin/gnome-shell -f | grep "$EXTENSION_UUID" --line-buffered | tee -a "$LOG_FILE"
