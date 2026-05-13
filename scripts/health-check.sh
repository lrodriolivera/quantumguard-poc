#!/bin/bash

# QuantumGuard AI - Health Check Script

echo "=========================================="
echo "  QuantumGuard AI - Health Check"
echo "=========================================="

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

check_service() {
    local name=$1
    local url=$2

    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "  $name: ${GREEN}OK${NC}"
        return 0
    else
        echo -e "  $name: ${RED}FAILED${NC}"
        return 1
    fi
}

echo ""
echo "Checking services..."
echo ""

FAILED=0

# Check Frontend
check_service "Frontend (3000)" "http://localhost:3000" || FAILED=1

# Check Backend
check_service "Backend (5000)" "http://localhost:5000/health" || FAILED=1

# Check Crypto Service
check_service "Crypto (8001)" "http://localhost:8001/health" || FAILED=1

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U quantum_user -d quantumguard > /dev/null 2>&1; then
    echo -e "  PostgreSQL (5432): ${GREEN}OK${NC}"
else
    echo -e "  PostgreSQL (5432): ${RED}FAILED${NC}"
    FAILED=1
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "  Redis (6381): ${GREEN}OK${NC}"
else
    echo -e "  Redis (6381): ${RED}FAILED${NC}"
    FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}Some services are not responding.${NC}"
    exit 1
fi
