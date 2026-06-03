#!/bin/bash

# Dev server with live reload — saves any CSS/JS/HTML change instantly in the
# browser without a manual refresh. The service worker is a no-op on localhost
# so there is no cache to bust.
#
# Requires Node/npx (npx live-server is downloaded automatically on first run).
# To fall back to the plain Python server: python3 -m http.server 8000

# Navigate to the public directory (where your website files are)
cd ./public

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "index.html not found in public directory"
    echo "Make sure you're running this from the Radiant-web directory"
    exit 1
fi

echo "Starting live-reload dev server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

# --no-browser: don't auto-open a new tab on every restart
# --port=8000:  keep the same port as before
npx live-server --port=8000 --no-browser
