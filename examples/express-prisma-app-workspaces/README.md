# express-prisma-app-workspaces

The **workspaces** variant of the `express-prisma` combo from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/express-prisma-app-workspaces express-prisma-app-workspaces
cd express-prisma-app-workspaces
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

npx prisma generate && npx prisma migrate deploy
```

## Seed (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' \
SEED_WORKSPACE_NAME='Default workspace' \
npm run seed
```

## Run

```bash
npm run start
```

- API: http://localhost:3007 (override with `PORT`)

## Workspaces specifics

- Every workspace-scoped request must send an `X-Workspace-Id` header — see
  `workspace.router.ts` and `authz.middleware.ts` in `src/lib/auth`.
- A user has no roles until they belong to a workspace: `POST /workspaces` makes the caller
  its first admin.

## Optional: Redis

Nothing here needs Redis — by default the permission cache and the login rate limiter live in each
server's memory. `src/redis-stores.ts` (this app's own file; the kit never depends on Redis) wires
Redis in, one use at a time:

```bash
docker compose up -d redis           # or: docker run -d -p 6379:6379 redis:7

REDIS_URL=redis://localhost:6379   # where Redis is — on its own it changes nothing
REDIS_AUTHZ_CACHE=true             # permission-cache entries in Redis, shared by every server
REDIS_RATE_LIMIT=true              # login rate-limit counters in Redis, so the limit holds across servers
AUTHZ_CACHE_ENABLED=false          # optional: no permission cache at all (Redis or memory)
```

Set only the flags you want: e.g. `REDIS_RATE_LIMIT=true` alone uses Redis for rate limiting and
keeps the permission cache in memory. See `authzCache` in the kit's `registry/README.md` for how
the cache stays correct across servers.

## Environment variables

Same as [`express-prisma-app`](../express-prisma-app#environment-variables), plus
`SEED_WORKSPACE_NAME` (default `"Default workspace"`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
