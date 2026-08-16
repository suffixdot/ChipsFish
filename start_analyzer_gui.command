#!/bin/bash
# Change directory to the Analyzer folder
cd "$(dirname "$0")/Engine/analyzer"

echo "=========================================================="
echo "    ChipsFish — Damath Solver & Tablebase Analyzer        "
echo "=========================================================="

# Kill any existing process on port 8081 to avoid "Address already in use"
EXISTING_PID=$(lsof -ti :8081)
if [ -n "$EXISTING_PID" ]; then
    echo "Freeing port 8081 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID
    sleep 0.5
fi

# Start a simple static file server (Python 3 ships with every Mac)
echo "Starting Solver GUI server at http://localhost:8081 ..."
python3 -m http.server 8081 &
SERVER_PID=$!

# Give it a moment to boot, then open in the default browser
sleep 1
open http://localhost:8081

echo "=========================================================="
echo "Solver active! Press Ctrl+C to stop the analyzer server."
echo "=========================================================="
wait $SERVER_PID
