#!/bin/bash

# Simple script to start Python server (assumes conda environment is already activated)
echo "🚀 Starting Python HTTP server on port 8000..."

# Navigate to the public directory (where your website files are)
cd Radiant-web/public

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ index.html not found in public directory"
    echo "Make sure you're running this from the Radiant-web directory"
    exit 1
fi

echo "📱 Your website will be available at: http://localhost:8000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Start the server
python3 -m http.server 8000 
