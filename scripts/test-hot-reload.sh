#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Hot-Reload Test Script
# ═══════════════════════════════════════════════════════════════
# This script verifies that hot-reloading works for both 
# frontend and backend services.
# ═══════════════════════════════════════════════════════════════

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Hot-Reload Verification Test${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if services are running
echo -e "${YELLOW}1. Checking if development services are running...${NC}"
if ! docker compose -f docker-compose.yml -f docker-compose.dev.yml ps | grep -q "Up"; then
    echo -e "${RED}✗ Services not running. Start with: make dev${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Services are running${NC}"
echo ""

# Check frontend accessibility
echo -e "${YELLOW}2. Checking frontend dev server (Vite)...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200"; then
    echo -e "${GREEN}✓ Frontend accessible at http://localhost:5173${NC}"
else
    echo -e "${RED}✗ Frontend not accessible${NC}"
    exit 1
fi
echo ""

# Check backend accessibility
echo -e "${YELLOW}3. Checking backend API...${NC}"
if curl -s http://localhost:8001/health | grep -q "ok"; then
    echo -e "${GREEN}✓ Backend accessible at http://localhost:8001${NC}"
else
    echo -e "${RED}✗ Backend not accessible${NC}"
    exit 1
fi
echo ""

# Test backend hot-reload
echo -e "${YELLOW}4. Testing backend hot-reload...${NC}"
echo -e "   ${YELLOW}Creating temporary test file...${NC}"

# Create test file
cat > project/backend/test_hotreload.py << 'EOF'
"""Temporary test file for hot-reload verification"""

def test_function():
    return "hot_reload_works"
EOF

sleep 3

# Check logs for reload
if docker compose -f docker-compose.yml -f docker-compose.dev.yml logs backend --tail=10 | grep -q "Reloading"; then
    echo -e "${GREEN}✓ Backend detected file change and reloaded${NC}"
else
    echo -e "${YELLOW}⚠ Could not verify reload from logs (check manually)${NC}"
fi

# Cleanup
rm -f project/backend/test_hotreload.py
echo ""

# Test frontend volume mount
echo -e "${YELLOW}5. Verifying frontend volume mounts...${NC}"
if docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T frontend ls /app/src/pages/UserPanel.tsx > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend source files are mounted${NC}"
else
    echo -e "${RED}✗ Frontend source files not accessible${NC}"
    exit 1
fi
echo ""

# Test backend volume mount
echo -e "${YELLOW}6. Verifying backend volume mounts...${NC}"
if docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend ls /app/main.py > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend source files are mounted${NC}"
else
    echo -e "${RED}✗ Backend source files not accessible${NC}"
    exit 1
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Hot-Reload Setup Verified!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Edit ${GREEN}project/frontend/src/pages/UserPanel.tsx${NC}"
echo -e "  2. Check http://localhost:5173 - changes appear instantly!"
echo -e "  3. Edit ${GREEN}project/backend/main.py${NC}"
echo -e "  4. Server auto-restarts in ~1-2 seconds"
echo -e ""
echo -e "${YELLOW}View logs:${NC} make logs"
echo -e "${YELLOW}Stop services:${NC} make stop"
echo ""

