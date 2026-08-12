# Getting started

From a fresh clone to a working login. Two paths: **docker** (one command, everything) or
**manual** (finer control, faster iteration on one piece).

## Prerequisites

- Node.js v26+ and [pnpm](https://pnpm.io/) v11+
- Docker (for the docker path, or just for Postgres on the manual path)
- Xcode / Android Studio only if you're touching the mobile apps

## Path A — docker (everything at once)

```bash
docker compose up --build
```

Brings up Postgres (internal to the compose network), all 8 example backends
(3001–3008), and all 4 admin consoles (3000, 3010, 5173, 5174). Each backend container
applies its migrations at startup.

**Seeding is a separate, required step** — nothing is authorized until the seeder has run.
It's idempotent; run it any time. For the reference backend:

```bash
docker exec library-nestjs-prisma-app-1 sh -c \
  'SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=Admin12345! npx tsx src/lib/auth/src/seed.ts'
```

That provisions the permission catalog, the default `admin`/`member` roles, and an initial
admin user. Then log in at **http://localhost:3000** with those credentials.

Without `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` the seeder still provisions the catalog and
roles but skips the admin user — there is deliberately no default password. Re-running the
seeder never overwrites an existing user's password.

```bash
docker compose down        # stop everything; add -v to also drop the Postgres volume
```

## Path B — manual (one backend + one console)

**1. Postgres** at `localhost:55432` with a passwordless `postgres` superuser (what every
checked-in `.env` points at):

```bash
docker run -d --name easy-auth-postgres -p 55432:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
psql -h localhost -p 55432 -U postgres -c "CREATE DATABASE example_nestjs_prisma"
```

**2. Install the workspace:**

```bash
pnpm install
```

**3. Backend** (`examples/nestjs-prisma-app`, port 3001):

```bash
cd examples/nestjs-prisma-app
npm install                       # plain npm on purpose — examples model a real consumer, outside the pnpm workspace
(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npx tsx src/lib/auth/src/seed.ts
npm run start                     # -> http://localhost:3001, Swagger at /docs, Scalar at /reference
```

**4. Console** (`apps/admin-nextjs`, port 3000):

```bash
cd apps/admin-nextjs
cp .env.example .env.local        # then set AUTH_SECRET (openssl rand -base64 32)
pnpm dev                          # -> http://localhost:3000
```

Log in with the seeded admin credentials.

### Console environment variables

| Var | What | Default |
|---|---|---|
| `NEXT_PUBLIC_AUTH_API_URL` | Backend URL as the **browser** sees it | `http://localhost:3001` |
| `AUTH_API_INTERNAL_URL` | Backend URL as the console's **server side** sees it (NextAuth `authorize()`, `proxy.ts` token verify). Only differs from the public URL when the console runs somewhere `localhost:3001` isn't the backend — e.g. in docker compose it's `http://nestjs-prisma-app:3001`. | falls back to `NEXT_PUBLIC_AUTH_API_URL` |
| `AUTH_SECRET` | NextAuth session-JWT signing secret. **Required** — generate with `openssl rand -base64 32`. | — |

### Backend environment variables (example apps)

| Var | What |
|---|---|
| `DATABASE_URL` | Postgres connection string (checked-in `.env` points at `localhost:55432`) |
| `AUTH_JWT_SECRET` | Access/refresh token signing secret — base64, 256-bit+. No default; the app refuses to start without it. |
| `PORT` | Listen port (each example has its own fallback, 3001–3008) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Seeder-only: create the initial admin |
| `DOCS_USERNAME` / `DOCS_PASSWORD` | Basic-Auth gate on `/docs` + `/reference`, enforced only when `NODE_ENV=production` |

## Port map

| Port | Service |
|---|---|
| 3000 | `apps/admin-nextjs` (console for 3001) |
| 3001–3004 | base-variant backends: nestjs-prisma, nestjs-drizzle, express-prisma, express-drizzle |
| 3005–3008 | workspaces-variant backends (same order) |
| 3010 | `apps/admin-nextjs-workspaces` (console for 3005) |
| 5173 / 5174 | `apps/admin-react` / `-workspaces` |
| 8080 | `apps/dev-portal` (`pnpm portal`, host-only — service status, ER diagram, schema drift) |
| 55432 | your local Postgres (manual path) |

## First things to try once you're in

- **Dashboard** — stat cards, recent audit activity, and the *Live activity* card: leave it
  open, log in from a second browser/incognito window, and watch the `session_created` event
  arrive over the socket.
- **Users → Add user** — create a user, assign roles via the multi-select, upload a photo
  (drag & drop).
- **Roles** — create a role and tick permissions in the grouped grid; saves are diff-based
  attach/detach.
- **Countries / Languages / Customers** — the same CRUD patterns over the content domains.
- **API docs** — http://localhost:3001/docs (Swagger) and `/reference` (Scalar).
