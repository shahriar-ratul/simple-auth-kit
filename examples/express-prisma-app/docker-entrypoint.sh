#!/bin/sh
# Runs at container startup (not image build time) — Postgres is only reachable once the
# container is up, and compose's `depends_on: condition: service_healthy` already ensures
# the DB is accepting connections before this script runs.
set -e

# prisma.config.ts lives at the project root, alongside prisma/ — see Dockerfile.
npx prisma migrate deploy

exec npm run start
