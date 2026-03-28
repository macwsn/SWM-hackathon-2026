# ═══════════════════════════════════════════════════════════════
# Blind Assistant - Development Makefile
# ═══════════════════════════════════════════════════════════════

.PHONY: help dev prod build clean logs test frontend backend health

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@echo "$(BLUE)════════════════════════════════════════════════════════$(NC)"
	@echo "$(GREEN)  Blind Assistant - Development Commands$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════$(NC)"
	@awk 'BEGIN {FS = ":.*##"; printf "\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Development

dev: ## Start all services in DEVELOPMENT mode (hot-reload enabled)
	@echo "$(GREEN)🚀 Starting development environment...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:5173$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:8001$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

dev-build: ## Rebuild and start development environment
	@echo "$(GREEN)🔨 Building development images...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build
	@echo "$(GREEN)🚀 Starting development environment...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

dev-daemon: ## Start development environment in background
	@echo "$(GREEN)🚀 Starting development environment (daemon)...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "$(GREEN)✅ Services started in background$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:5173$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:8001$(NC)"

##@ Production

prod: ## Start all services in PRODUCTION mode
	@echo "$(GREEN)🚀 Starting production environment...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:8001$(NC)"
	docker compose up

prod-build: ## Build production images from scratch
	@echo "$(GREEN)🔨 Building production images...$(NC)"
	docker compose build --no-cache
	@echo "$(GREEN)✅ Production images built$(NC)"

prod-daemon: ## Start production environment in background
	@echo "$(GREEN)🚀 Starting production environment (daemon)...$(NC)"
	docker compose up -d
	@echo "$(GREEN)✅ Services started in background$(NC)"

##@ Service Management

frontend: ## Start only frontend (development mode)
	@echo "$(GREEN)🎨 Starting frontend dev server...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up frontend

backend: ## Start only backend (development mode)
	@echo "$(GREEN)⚙️  Starting backend dev server...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up backend

stop: ## Stop all running services
	@echo "$(YELLOW)⏹️  Stopping services...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down
	docker compose down
	@echo "$(GREEN)✅ Services stopped$(NC)"

restart: stop dev-daemon ## Restart all services

##@ Maintenance

clean: ## Remove all containers, volumes, and images
	@echo "$(RED)⚠️  WARNING: This will remove ALL data and images!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --rmi all
	docker compose down -v --rmi all
	@echo "$(GREEN)✅ Cleanup complete$(NC)"

clean-cache: ## Remove only build cache and stopped containers
	@echo "$(YELLOW)🧹 Cleaning build cache...$(NC)"
	docker system prune -f
	@echo "$(GREEN)✅ Cache cleaned$(NC)"

rebuild-frontend: ## Rebuild only frontend (development)
	@echo "$(GREEN)🔨 Rebuilding frontend...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build frontend
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d frontend
	@echo "$(GREEN)✅ Frontend rebuilt and restarted$(NC)"

rebuild-backend: ## Rebuild only backend (development)
	@echo "$(GREEN)🔨 Rebuilding backend...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build backend
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d backend
	@echo "$(GREEN)✅ Backend rebuilt and restarted$(NC)"

##@ Monitoring

logs: ## Show logs for all services
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

logs-frontend: ## Show frontend logs
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f frontend

logs-backend: ## Show backend logs
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend

ps: ## List running services
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

health: ## Check health status of all services
	@echo "$(BLUE)════════════════════════════════════════════════════════$(NC)"
	@echo "$(GREEN)  Service Health Status$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(YELLOW)Frontend (Dev):$(NC)"
	@curl -s -o /dev/null -w "  Status: %{http_code}\n" http://localhost:5173 || echo "  $(RED)❌ Not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)Backend:$(NC)"
	@curl -s http://localhost:8001/health | python3 -m json.tool 2>/dev/null || echo "  $(RED)❌ Not responding$(NC)"
	@echo ""

##@ Shell Access

shell-frontend: ## Open shell in frontend container
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend sh

shell-backend: ## Open shell in backend container
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend bash

##@ Testing

test-hotreload: ## Verify hot-reload setup is working
	@chmod +x scripts/test-hot-reload.sh
	@./scripts/test-hot-reload.sh

test: ## Run all tests (placeholder - implement as needed)
	@echo "$(YELLOW)⚠️  Tests not yet implemented$(NC)"

test-frontend: ## Run frontend tests
	@echo "$(YELLOW)Running frontend tests...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npm test

test-backend: ## Run backend tests
	@echo "$(YELLOW)Running backend tests...$(NC)"
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend pytest

