#!/usr/bin/env bash
set -euo pipefail
echo "Starting Shopping List on port ${PORT:-8099}"

# Virtual display for Chromium ("headed" looks like a normal browser to Tesco).
# Started directly rather than via xvfb-run, which can hang waiting for a signal in containers.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
[ -e /tmp/.X11-unix/X99 ] || { echo "Xvfb didn't start:"; cat /tmp/xvfb.log; }

exec node /app/server/dist/index.js
