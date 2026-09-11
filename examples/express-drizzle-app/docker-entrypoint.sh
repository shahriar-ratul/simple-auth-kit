#!/bin/sh
# Runs at container startup (not image build time) — Postgres is only reachable once the
# container is up, and compose's `depends_on: condition: service_healthy` already ensures
# the DB is accepting connections before this script runs.
#
# drizzle.config.ts lives at the project root, alongside drizzle/ — Drizzle's own
# convention, no cd needed (schema/out are resolved as absolute paths inside the config
# itself, so this works regardless of cwd).
set -e

npx drizzle-kit migrate

exec npm run start
