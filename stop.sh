#!/bin/bash

# Stop the backend and frontend dev servers (leaves PostgreSQL running)
set -e

echo "Stopping backend (port 3001)..."
lsof -ti :3001 | xargs kill 2>/dev/null && echo "Backend stopped." || echo "Backend not running."

echo "Stopping frontend (port 3000)..."
lsof -ti :3000 | xargs kill 2>/dev/null && echo "Frontend stopped." || echo "Frontend not running."

echo "Done. (PostgreSQL container left running)"
