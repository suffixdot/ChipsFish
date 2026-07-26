#!/bin/bash
# Change directory to the GUI folder
cd "$(dirname "$0")/Engine/gui"

echo "========================================"
echo "        ChipsFish — JS Engine          "
echo "========================================"

# Kill any existing process on port 8080 to avoid "Address already in use"
EXISTING_PID=$(lsof -ti :8080)
if [ -n "$EXISTING_PID" ]; then
    echo "Freeing port 8080 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID
    sleep 0.5
fi

# Start a simple static file server (Python 3 ships with every Mac)
echo "Starting local server at http://localhost:8080 ..."
python3 -m http.server 8080 &
SERVER_PID=$!

# Give it a moment to boot, then open in the default browser
sleep 1
open http://localhost:8080

echo "Press Ctrl+C to stop the server."
wait $SERVER_PID
