#!/bin/bash

# QuantumGuard AI - Development Startup Script
# This script starts all services in development mode

set -e

echo "=========================================="
echo "  QuantumGuard AI - Development Mode"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Starting QuantumGuard AI services...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Step 1: Start PostgreSQL and Redis
echo -e "\n${GREEN}[1/4] Starting PostgreSQL and Redis...${NC}"
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U quantum_user -d quantumguard > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}PostgreSQL is ready!${NC}"

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}Redis is ready!${NC}"

# Step 2: Start Crypto Service
echo -e "\n${GREEN}[2/4] Starting Crypto Service...${NC}"
cd "$PROJECT_ROOT/crypto-service"

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "Starting Crypto Service on port 8001..."
uvicorn main:app --host 0.0.0.0 --port 8001 --reload &
CRYPTO_PID=$!
echo "Crypto Service PID: $CRYPTO_PID"

# Wait for crypto service to be ready
sleep 3
until curl -s http://localhost:8001/health > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}Crypto Service is ready!${NC}"

# Step 3: Start Backend
echo -e "\n${GREEN}[3/4] Starting Backend API...${NC}"
cd "$PROJECT_ROOT/backend"

if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

echo "Starting Backend on port 5000..."
npm run dev &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready
sleep 5
until curl -s http://localhost:5000/health > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}Backend is ready!${NC}"

# Step 4: Start Frontend
echo -e "\n${GREEN}[4/4] Starting Frontend...${NC}"
cd "$PROJECT_ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "Starting Frontend on port 3000..."
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
sleep 5
echo -e "${GREEN}Frontend is ready!${NC}"

# Display status
echo ""
echo "=========================================="
echo -e "${GREEN}  All services are running!${NC}"
echo "=========================================="
echo ""
echo "Services:"
echo "  - Frontend:      http://localhost:3000"
echo "  - Backend API:   http://localhost:5000"
echo "  - Crypto Service: http://localhost:8001"
echo "  - PostgreSQL:    localhost:5432"
echo "  - Redis:         localhost:6381"
echo ""
echo "API Documentation:"
echo "  - Crypto API:    http://localhost:8001/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Save PIDs for cleanup
echo "$CRYPTO_PID" > "$PROJECT_ROOT/.pids/crypto.pid"
echo "$BACKEND_PID" > "$PROJECT_ROOT/.pids/backend.pid"
echo "$FRONTEND_PID" > "$PROJECT_ROOT/.pids/frontend.pid"

# Wait for any process to exit
wait
