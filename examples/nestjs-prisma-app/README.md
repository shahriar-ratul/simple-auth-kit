# nestjs-prisma-app

A NestJS + Prisma backend built from the `nestjs-prisma` combo of
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — sessions, JWTs, 2FA,
OAuth, password reset, and RBAC (roles/permissions), backed by PostgreSQL via Prisma.

This is a **standalone copy** — it doesn't need the full monorepo. Clone just this folder:

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-prisma-app nestjs-prisma
cd nestjs-prisma
```

## Prerequisites

- Node.js (built/verified on v26)
- A reachable PostgreSQL server

## Setup

```bash
npm install

cp src/lib/auth/.env.example src/lib/auth/.env
# edit src/lib/auth/.env:
#   DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

# Required — the app refuses to start without it. Changing it invalidates every issued token.
echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env

(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
```

## Seed RBAC (required once)

A freshly migrated database has no permission catalog, no roles, and no users — nothing is
authorized until this has run. It's idempotent (safe to re-run).

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npm run seed
```

Without `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` set, the seeder still seeds the permission
catalog and default roles but skips creating an admin user (no default password is ever
invented for you).

## Run

```bash
npm run start
```

- API: http://localhost:3001 (override with `PORT`)
- Swagger UI: `/docs` — Scalar: `/reference`

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_JWT_SECRET` | yes | base64, 256-bit+ — no default, app won't boot without it |
| `PORT` | no | defaults to `3001` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | creates an initial admin on seed |
| `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD` | no | creates a second seeded superadmin account |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | only if using Google OAuth |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | no | only if using Sign in with Apple |
| `DOCS_USERNAME` / `DOCS_PASSWORD` | no | Basic Auth for `/docs`, enforced only when `NODE_ENV=production` |

## Pair with a frontend

Point [`admin-nextjs`](https://github.com/shahriar-ratul/simple-auth-kit/tree/main/apps/admin-nextjs)
(or any client using [`@simple-auth-kit/auth-client`](https://www.npmjs.com/package/@simple-auth-kit/auth-client))
at this API's URL — `NEXT_PUBLIC_AUTH_API_URL=http://localhost:3001` for the default port above.

## Source

Full source, other combos (Drizzle, Express) and variants (workspaces): [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).
