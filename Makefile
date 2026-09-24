# SMYou Pro — single entry point for humans, Claude Code and CI.
# Parts not scaffolded yet (backend/ or frontend/) are skipped with a notice, so every M0 step can be green.
SHELL := /bin/bash
.DEFAULT_GOAL := help

# Dev/test on the Mac M2: compose.dev.yml + .env.dev. Production (AlmaLinux): compose.prod.yml + .env.prod.
COMPOSE := docker compose -f compose.dev.yml $(if $(wildcard .env.dev),--env-file .env.dev)
COMPOSE_SMOKE := docker compose -f compose.prod.yml --env-file .env.prod.example -p smyou-smoke
TAG ?= dev
PLATFORM ?= linux/amd64
PRETTIER_SRC := "src/**/*.{ts,tsx,css}"
PRETTIER_ALL := "src/**/*.{ts,tsx,css}" "e2e/**/*.ts"

# Prefer Node 22 from nvm locally (see .nvmrc); CI uses actions/setup-node.
NODE22_BIN := $(shell ls -d $(HOME)/.nvm/versions/node/v22.*/bin 2>/dev/null | tail -1)
ifneq ($(NODE22_BIN),)
export PATH := $(NODE22_BIN):$(PATH)
endif

HAS_BE := $(wildcard backend/pyproject.toml)
HAS_FE := $(wildcard frontend/package.json)
# $(call be,<cmd>) / $(call fe,<cmd>) run <cmd> inside the folder, or print a skip notice.
be = $(if $(HAS_BE),cd backend && $(1),@echo "⏭  skip backend step (not scaffolded yet)")
fe = $(if $(HAS_FE),cd frontend && $(1),@echo "⏭  skip frontend step (not scaffolded yet)")

.PHONY: help setup up down logs ps db-shell migrate migration \
        lint format typecheck test-unit test contract ac migrations-check \
        check-fast check e2e e2e-a11y screenshots verify mutation mutation-changed \
        build-prod smoke-prod

help: ## List targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n",$$1,$$2}'

# ---------- setup & stack ----------
setup: ## Install deps, git hooks, Playwright browsers
	$(call be,uv sync)
	$(call fe,npm ci && npx playwright install chromium webkit)
	uvx pre-commit install
	@test -f .env.dev || cp .env.dev.example .env.dev

up: ## Start dev stack (db, backend, web) and wait for health
	$(COMPOSE) up -d --build --wait

down: ## Stop dev stack (keeps data volumes)
	$(COMPOSE) down

logs: ## Follow logs
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

db-shell: ## psql into dev database
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-smyou} $${POSTGRES_DB:-smyou}

migrate: ## Apply migrations to dev DB
	$(COMPOSE) exec backend alembic upgrade head

migration: ## Create migration: make migration name=add_orders
	@test -n "$(name)" || (echo "usage: make migration name=<snake_case>"; exit 1)
	$(call be,uv run alembic revision --autogenerate -m "$(name)")

# ---------- static checks ----------
lint: ## ruff + import-linter + eslint + prettier check + raw color check
	$(call be,uv run ruff check . && uv run ruff format --check . && uv run lint-imports)
	$(call fe,npm run lint && npx prettier --check $(PRETTIER_SRC))
	python3 scripts/check_no_raw_colors.py
	python3 -m unittest discover -q -s .claude/hooks -p 'test_*.py'

format: ## Auto-format everything
	$(call be,uv run ruff check --fix . && uv run ruff format .)
	$(call fe,npx prettier --write $(PRETTIER_ALL))

typecheck: ## mypy --strict + tsc --noEmit
	$(call be,uv run mypy app)
	$(call fe,npx tsc --noEmit)

# ---------- tests ----------
test-unit: ## Fast tests: backend unit (no DB) + frontend vitest
	$(call be,uv run pytest tests/unit -q)
	$(call fe,npx vitest run)

test: ## All backend tests (needs db) + frontend vitest with coverage thresholds
	$(if $(HAS_BE),$(COMPOSE) up -d --wait db)
	$(call be,uv run pytest -q --cov=app --cov-branch --cov-report=term-missing:skip-covered --cov-fail-under=85)
	$(call fe,npx vitest run --coverage)

contract: ## Export OpenAPI, regenerate TS types, fail on drift
	$(if $(and $(HAS_BE),$(HAS_FE)),,@echo "⏭  skip contract (needs backend and frontend)")
	$(if $(and $(HAS_BE),$(HAS_FE)),cd backend && uv run python ../scripts/export_openapi.py ../frontend/src/lib/api/openapi.json)
	$(if $(and $(HAS_BE),$(HAS_FE)),cd frontend && npx openapi-typescript src/lib/api/openapi.json -o src/lib/api/schema.d.ts && npx prettier --write src/lib/api/)
	$(if $(and $(HAS_BE),$(HAS_FE)),@git diff --exit-code -- frontend/src/lib/api || (echo "API contract changed: commit regenerated files"; exit 1))

ac: ## Acceptance-criteria → test traceability (writes reports/ac-matrix.md)
	python3 scripts/check_ac_coverage.py

migrations-check: ## upgrade → downgrade -1 → upgrade on test DB, and model/migration drift
	$(if $(HAS_BE),$(COMPOSE) up -d --wait db)
	$(call be,export DATABASE_URL=$${TEST_DATABASE_URL:-postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou_test} && uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head && uv run alembic check)

# ---------- gates ----------
check-fast: lint typecheck test-unit ## Quick gate (Stop hook runs this)

check: lint typecheck test contract ac migrations-check ## Full gate before commit/PR

e2e: ## Playwright (mobile + desktop, axe) against the Docker stack
	$(if $(HAS_FE),$(COMPOSE) up -d --build --wait)
	$(if $(wildcard backend/scripts/seed_e2e.py),$(COMPOSE) exec -T backend python -m scripts.seed_e2e)
	$(call fe,npx playwright test)

e2e-a11y: ## Only accessibility checks
	$(call fe,npx playwright test --grep @a11y)

screenshots: ## Capture key screens at 390px and 1440px into reports/screenshots
	$(call fe,npx playwright test --grep @screenshot)

verify: check e2e ## Everything; required before saying "done"
	@echo "✅ make verify passed — write reports/verification.md (see /verify)"

mutation: ## Mutation testing on domain layer (slow; nightly CI)
	$(call be,uv run mutmut run && uv run mutmut results)

mutation-changed: ## Mutation testing when domain files changed vs main (paths set in pyproject [tool.mutmut])
	@if git diff --quiet main...HEAD -- 'backend/app/modules/*/domain.py'; then echo "no domain changes"; \
	else cd backend && uv run mutmut run && uv run mutmut results; fi

# ---------- production images (Mac M2 → AlmaLinux x86_64) ----------
build-prod: ## Build production images for $(PLATFORM): make build-prod TAG=2026.10.01-1
	docker buildx build --platform $(PLATFORM) -t smyou-backend:$(TAG) --target prod --load backend
	docker buildx build --platform $(PLATFORM) -t smyou-web:$(TAG) --target prod --load frontend

smoke-prod: ## Run the built amd64 images with compose.prod.yml (test values) and hit /api/v1/health
	IMAGE_TAG=$(TAG) $(COMPOSE_SMOKE) up -d --wait
	curl -fsS http://localhost:$${WEB_PORT:-8080}/api/v1/health && echo " ✅ smoke ok"
	IMAGE_TAG=$(TAG) $(COMPOSE_SMOKE) down
