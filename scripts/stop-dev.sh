#!/bin/bash

# QuantumGuard AI - Stop Development Services

set -e

echo "Stopping QuantumGuard AI services..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Kill processes by port
echo "Stopping Frontend (port 3000)..."
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true

echo "Stopping Backend (port 5000)..."
lsof -ti:5000 | xargs -r kill -9 2>/dev/null || true

echo "Stopping Crypto Service (port 8001)..."
lsof -ti:8001 | xargs -r kill -9 2>/dev/null || true

# Stop Docker containers
echo "Stopping Docker containers..."
cd "$PROJECT_ROOT"
docker-compose down 2>/dev/null || true

# Clean up PID files
rm -rf "$PROJECT_ROOT/.pids" 2>/dev/null || true

echo "All services stopped!"
