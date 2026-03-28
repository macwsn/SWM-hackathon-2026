#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Blind Assistant - MVP Infrastructure Setup Script
# ═══════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "🚀 Blind Assistant - MVP Infrastructure Setup"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker Desktop first.${NC}"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose v2 is not available. Please update Docker Desktop.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed${NC}"
echo ""

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p nginx/ssl
mkdir -p database
mkdir -p services/{depth-worker-a,depth-worker-b,streaming-gateway,orchestrator,gemini-service,map-service}

# Generate self-signed SSL certificates for development
if [ ! -f "nginx/ssl/cert.pem" ]; then
    echo "🔐 Generating self-signed SSL certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=PL/ST=Warsaw/L=Warsaw/O=BlindAssistant/CN=localhost" \
        2>/dev/null
    echo -e "${GREEN}✅ SSL certificates generated${NC}"
else
    echo -e "${YELLOW}⚠️  SSL certificates already exist${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# ═══════════════════════════════════════════════════════════════
# Blind Assistant - Environment Configuration
# ═══════════════════════════════════════════════════════════════

# Gemini API (required for scene description)
GEMINI_API_KEY=your_gemini_api_key_here

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=blind_assistant

# Redis
REDIS_PASSWORD=

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# Model Configuration
DEPTH_MODEL_DEVICE=cuda  # Options: cuda, cpu, mps
HUGGINGFACE_CACHE=/models/cache

# Service URLs (for local development)
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/blind_assistant
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
else
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
fi

echo ""
echo "🐳 Starting MVP infrastructure (Redis, PostgreSQL, MinIO)..."
echo ""

# Start MVP infrastructure
docker compose -f docker-compose.mvp.yml up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
echo ""
echo "🏥 Service Health Check:"
echo "------------------------"

# Redis
if docker compose -f docker-compose.mvp.yml exec -T redis redis-cli ping &> /dev/null; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not responding${NC}"
fi

# PostgreSQL
if docker compose -f docker-compose.mvp.yml exec -T postgres pg_isready -U postgres &> /dev/null; then
    echo -e "${GREEN}✅ PostgreSQL is running${NC}"
else
    echo -e "${RED}❌ PostgreSQL is not responding${NC}"
fi

# MinIO
if curl -f http://localhost:9000/minio/health/live &> /dev/null; then
    echo -e "${GREEN}✅ MinIO is running${NC}"
else
    echo -e "${YELLOW}⚠️  MinIO might still be starting...${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "🎉 MVP Infrastructure Setup Complete!"
echo "════════════════════════════════════════════"
echo ""
echo "📊 Access Points:"
echo "  • Redis:       localhost:6379"
echo "  • PostgreSQL:  localhost:5432"
echo "  • MinIO API:   http://localhost:9000"
echo "  • MinIO UI:    http://localhost:9001"
echo ""
echo "🔑 Credentials:"
echo "  • PostgreSQL:  postgres / postgres"
echo "  • MinIO:       minioadmin / minioadmin"
echo ""
echo "🧪 Test Connections:"
echo "  redis-cli -h localhost -p 6379 ping"
echo "  psql -h localhost -U postgres -d blind_assistant"
echo "  curl http://localhost:9000/minio/health/live"
echo ""
echo "🛑 Stop Infrastructure:"
echo "  docker compose -f docker-compose.mvp.yml down"
echo ""
echo "📚 Next Steps:"
echo "  1. Implement service code (depth-worker-a, orchestrator, etc.)"
echo "  2. Uncomment services in docker-compose.yml"
echo "  3. Run: docker compose up -d"
echo ""

