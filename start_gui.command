#!/bin/bash
# Change directory to the Engine folder where project files are located
cd "$(dirname "$0")/Engine"

echo "========================================"
echo "    Starting Damath Engine Web GUI      "
echo "========================================"

# Kill any existing process on port 8000 to avoid "Address already in use"
echo "Checking for existing processes on port 8000..."
EXISTING_PID=$(lsof -ti :8000)
if [ -n "$EXISTING_PID" ]; then
    echo "Killing existing process on port 8000 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID
    sleep 0.5
fi

# Make sure the C++ binary is compiled first (synchronously), then start the server
echo "Building C++ engine (if needed)..."
make damath_engine
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to compile damath_engine. Check your C++ source."
    exit 1
fi

# Start the Python server in the background
echo "Starting GUI server..."
python3 gui_server.py &
SERVER_PID=$!

# Wait for the server to boot up
sleep 1.5

# Open the local address in the default browser
echo "Opening web interface in browser..."
open http://localhost:8000

# Keep the terminal open and wait for the server process to exit (e.g. via Ctrl+C)
wait $SERVER_PID
