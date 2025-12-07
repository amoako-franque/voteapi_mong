# ================================
# VoteAPI Makefile
# ================================
# Usage: make <target>
# ================================

.PHONY: help dev prod build start stop restart logs shell db-shell redis-shell clean reset seed

# Default target
help:
	@echo "VoteAPI Docker Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development stack"
	@echo "  make dev-build    - Build and start development stack"
	@echo "  make logs         - View API logs"
	@echo "  make shell        - Shell into API container"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production stack"
	@echo "  make prod-build   - Build and start production stack"
	@echo ""
	@echo "Database:"
	@echo "  make db-shell     - Shell into MongoDB"
	@echo "  make redis-shell  - Shell into Redis"
	@echo "  make seed         - Seed database with test data"
	@echo ""
	@echo "Maintenance:"
	@echo "  make stop         - Stop all containers"
	@echo "  make restart      - Restart all containers"
	@echo "  make clean        - Stop and remove containers"
	@echo "  make reset        - Reset everything (WARNING: deletes data)"
	@echo ""
	@echo "Status:"
	@echo "  make ps           - Show container status"
	@echo "  make health       - Check API health"

# ================================
# Development
# ================================

dev:
	docker-compose up -d
	@echo ""
	@echo "✅ Development stack started!"
	@echo ""
	@echo "📍 API:            http://localhost:57788"
	@echo "📚 Swagger:        http://localhost:57788/api-docs"
	@echo "💾 MongoDB Admin:  http://localhost:8081 (admin/admin123)"
	@echo "🔴 Redis Admin:    http://localhost:8082"
	@echo "📧 MailHog:        http://localhost:8025"

dev-build:
	docker-compose up -d --build
	@echo ""
	@echo "✅ Development stack built and started!"

# ================================
# Production
# ================================

prod:
	docker-compose -f docker-compose.prod.yml up -d
	@echo ""
	@echo "✅ Production stack started!"

prod-build:
	docker-compose -f docker-compose.prod.yml up -d --build
	@echo ""
	@echo "✅ Production stack built and started!"

prod-env:
	@if [ ! -f docker/env.production ]; then \
		cp docker/env.production.example docker/env.production; \
		echo "Created docker/env.production - Please edit with your production values"; \
	else \
		echo "docker/env.production already exists"; \
	fi

# ================================
# Container Management
# ================================

start:
	docker-compose start

stop:
	docker-compose stop
	@echo "✅ All containers stopped"

restart:
	docker-compose restart
	@echo "✅ All containers restarted"

logs:
	docker-compose logs -f api

logs-all:
	docker-compose logs -f

ps:
	docker-compose ps

health:
	@curl -s http://localhost:57788/health | python3 -m json.tool 2>/dev/null || echo "API not responding"

# ================================
# Shell Access
# ================================

shell:
	docker-compose exec api sh

db-shell:
	docker-compose exec mongo mongosh voteapi

redis-shell:
	docker-compose exec redis redis-cli

# ================================
# Database
# ================================

seed:
	docker-compose exec api node scripts/seedData.js

create-admin:
	docker-compose exec api node scripts/createAdminUsers.js

create-voters:
	docker-compose exec api node scripts/createVotersForRoles.js

db-backup:
	docker-compose exec mongo mongodump --out /data/backup
	@echo "✅ MongoDB backup created"

db-restore:
	docker-compose exec mongo mongorestore /data/backup
	@echo "✅ MongoDB restored from backup"

# ================================
# Cleanup
# ================================

clean:
	docker-compose down
	@echo "✅ Containers removed"

clean-prod:
	docker-compose -f docker-compose.prod.yml down
	@echo "✅ Production containers removed"

reset:
	@echo "⚠️  WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker-compose down -v --remove-orphans
	@echo "✅ All containers and volumes removed"

reset-prod:
	@echo "⚠️  WARNING: This will delete all production data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker-compose -f docker-compose.prod.yml down -v --remove-orphans
	@echo "✅ All production containers and volumes removed"

# ================================
# Build
# ================================

build:
	docker-compose build

build-prod:
	docker-compose -f docker-compose.prod.yml build

build-no-cache:
	docker-compose build --no-cache

# ================================
# Utility
# ================================

prune:
	docker system prune -f
	@echo "✅ Docker system pruned"

prune-all:
	docker system prune -af
	@echo "✅ Docker system fully pruned"

