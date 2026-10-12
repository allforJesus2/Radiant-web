#!/bin/bash

# Dev server with live reload — saves any CSS/JS/HTML change instantly in the
# browser without a manual refresh. The service worker is a no-op on localhost
# so there is no cache to bust.
#
# Requires Node/npx (npx live-server is downloaded automatically on first run).
# To fall back to the plain Python server: python3 -m http.server 8000
#
# npm_config_offline=true makes npx use the already-cached live-server instead
# of fetching its metadata from registry.npmjs.org — that fetch stalls on the
# phone-proxy (SOCKS/cellular) link even though the package is already cached.

cd ./public

if [ ! -f "index.html" ]; then
    echo "index.html not found in public directory"
    echo "Make sure you're running this from the Radiant-web directory"
    exit 1
fi

echo "Starting live-reload dev server on http://localhost:8005"
echo "Press Ctrl+C to stop"
echo ""

npm_config_offline=true npm_config_registry=https://registry.npmjs.org npx --yes live-server --port=8005 --no-browser
