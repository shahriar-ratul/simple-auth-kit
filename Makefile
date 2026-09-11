.PHONY: help install up up-build down down-v build logs ps restart portal typecheck test clean prove-changed prove-all

help:
	@echo "simple-auth-kit make targets:"
	@echo "  make install    - pnpm install (registry, cli, packages, apps)"
	@echo "  make up         - docker compose up (foreground)"
	@echo "  make up-build   - docker compose up --build (foreground, rebuilds images)"
	@echo "  make down       - docker compose down"
	@echo "  make down-v     - docker compose down -v (also drops the Postgres volume)"
	@echo "  make build      - docker compose build"
	@echo "  make restart    - docker compose down && docker compose up --build"
	@echo "  make logs       - docker compose logs -f"
	@echo "  make ps         - docker compose ps"
	@echo "  make portal     - run the dev portal (http://localhost:8080)"
	@echo "  make typecheck  - pnpm -r typecheck"
	@echo "  make test       - pnpm -r test"
	@echo "  make prove-changed - check-combo-drift + prove-cycle for combos changed vs origin/main (core changes = all 4)"
	@echo "  make prove-all  - check-combo-drift + prove-cycle for all 4 combos, unconditionally"
	@echo "  make clean      - docker compose down -v --remove-orphans"

install:
	pnpm install

up:
	docker compose up

up-build:
	docker compose up --build

down:
	docker compose down

down-v:
	docker compose down -v

build:
	docker compose build

restart: down up-build

logs:
	docker compose logs -f

ps:
	docker compose ps

portal:
	pnpm portal

typecheck:
	pnpm -r typecheck

test:
	pnpm -r test

prove-changed:
	node scripts/check-combo-drift.mjs
	bash scripts/prove-changed.sh

prove-all:
	node scripts/check-combo-drift.mjs
	for combo in nestjs-prisma nestjs-drizzle express-prisma express-drizzle; do (cd registry/combos/$$combo && npm run prove-cycle) || exit 1; done

clean:
	docker compose down -v --remove-orphans
