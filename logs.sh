#!/bin/bash

LOG_FILE="testing.log"

echo "Following gnome-shell logs for Global Menu (also saved to $LOG_FILE)"
journalctl /usr/bin/gnome-shell -f | grep -i --line-buffered "globalmenu" | tee -a "$LOG_FILE"
