#!/usr/bin/env bash
set -euo pipefail
echo "Starting Shopping List on port ${PORT:-8099}"
# Always run under a virtual display; harmless when the headless option is on.
exec xvfb-run -a --server-args="-screen 0 1280x1024x24" node /app/server/dist/index.js
