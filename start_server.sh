#!/bin/bash

# Script to activate conda environment and start Python server for testing
echo "Starting development server..."

# Try to initialize conda if not already done
if ! command -v conda &> /dev/null; then
    echo "❌ Conda not found in PATH"
    echo "Please run: conda init bash"
    echo "Then restart your terminal or run: source ~/.bashrc"
    exit 1
fi

# Activate conda environment
echo "Activating conda environment 'firebase'..."
conda activate firebase

# Check if conda environment activation was successful
if [ $? -eq 0 ]; then
    echo "✅ Conda environment 'firebase' activated successfully"
else
    echo "❌ Failed to activate conda environment 'firebase'"
    echo "Please make sure the environment exists: conda create -n firebase python=3.x"
    echo ""
    echo "Alternative: You can manually activate the environment first:"
    echo "1. Run: conda activate firebase"
    echo "2. Then run: python -m http.server 8000"
    exit 1
fi

# Navigate to the public directory (where your website files are)
cd public

# Start Python HTTP server
echo "🚀 Starting Python HTTP server on port 8000..."
echo "📱 Your website will be available at: http://localhost:8000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Start the server
python3 -m http.server 8000 