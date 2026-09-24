# express-drizzle-app

An Express + Drizzle ORM backend built from the `express-drizzle` combo of
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — sessions, JWTs, 2FA,
OAuth, password reset, and RBAC, backed by PostgreSQL via Drizzle.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/express-drizzle-app express-drizzle-app
cd express-drizzle-app
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

npx drizzle-kit migrate
```

## Seed RBAC (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npm run seed
```

## Run

```bash
npm run start
```

- API: http://localhost:3004 (override with `PORT`)
- OpenAPI spec served at `/docs` and `/docs-json`

## Optional: Redis

Nothing here needs Redis — by default the permission cache and the login rate limiter live in each
server's memory. `src/redis-stores.ts` (this app's own file; the kit never depends on Redis) wires
Redis in, one use at a time:

```bash
docker run -d -p 6379:6379 redis:7

REDIS_URL=redis://localhost:6379   # where Redis is — on its own it changes nothing
REDIS_AUTHZ_CACHE=true             # permission-cache entries in Redis, shared by every server
REDIS_RATE_LIMIT=true              # login rate-limit counters in Redis, so the limit holds across servers
AUTHZ_CACHE_ENABLED=false          # optional: no permission cache at all (Redis or memory)
```

Set only the flags you want: e.g. `REDIS_RATE_LIMIT=true` alone uses Redis for rate limiting and
keeps the permission cache in memory. See `authzCache` in the kit's `registry/README.md` for how
the cache stays correct across servers.

## Environment variables

Same set as [`nestjs-prisma-app`](../nestjs-prisma-app#environment-variables) — `DATABASE_URL`,
`AUTH_JWT_SECRET`, `PORT`, `SEED_ADMIN_*`, `SEED_SUPERADMIN_*`, `REDIS_URL`/`REDIS_AUTHZ_CACHE`/`REDIS_RATE_LIMIT`/`AUTHZ_CACHE_ENABLED` (optional, above), OAuth vars, `DOCS_USERNAME`/`DOCS_PASSWORD`.

## Pair with a frontend

Point [`admin-nextjs`](../../apps/admin-nextjs) or `admin-react` at this API
(`NEXT_PUBLIC_AUTH_API_URL=http://localhost:3004` / `VITE_AUTH_API_URL=http://localhost:3004`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
