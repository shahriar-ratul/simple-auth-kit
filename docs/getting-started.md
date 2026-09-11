# Getting started

From a fresh clone to a working login. Two paths: **docker** (one command, everything) or
**manual** (finer control, faster iteration on one piece).

## Prerequisites

- Node.js v26+ and [pnpm](https://pnpm.io/) v11+
- Docker (for the docker path, or just for Postgres on the manual path)
- Xcode / Android Studio only if you're touching the mobile apps

## Path A — docker (everything at once)

```bash
cp .env.example .env       # then fill in every secret: openssl rand -base64 32 for each
docker compose up --build  # or: make up-build
```

The root `.env` is required — compose interpolates the 8 per-backend `AUTH_JWT_SECRET_*`
values and the consoles' `AUTH_SECRET` from it and refuses to start with them unset. Secrets
never live in `docker-compose.yml` itself (see `CLAUDE.md` for the rule).

This brings up Postgres (internal to the compose network, its 8 `example_*` databases created
on first boot via `docker/postgres-init/`), all 8 example backends (ports 3001–3008, each
applying its migrations at container startup), and all 4 admin consoles (3000, 3010, 5173,
5174).

**Seeding is a separate, required step** — a freshly migrated database has no permission
catalog, no roles, and no users, so nothing is authorized until the seeder has run. Compose
does not run it for you. It's idempotent; run it any time, per backend you intend to use:

```bash
docker exec -e SEED_ADMIN_EMAIL=admin@example.com -e SEED_ADMIN_PASSWORD='Admin12345!' \
  simple-auth-kit-nestjs-prisma-app-1 sh -c 'node_modules/.bin/tsx src/lib/auth/src/seed.ts'
```

That provisions the permission catalog, the default `admin`/`member` roles, and an initial
admin user. (On a workspaces-variant backend it also creates the first workspace and makes
that admin its first member.) Then log in at **http://localhost:3000** with those credentials.

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
docker run -d --name simple-auth-kit-postgres -p 55432:5432 \
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
npx prisma generate && npx prisma migrate deploy
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
| `AUTH_SECRET` | NextAuth session-JWT signing secret (`apps/admin-nextjs` only — the other three consoles don't use NextAuth). **Required** there — generate with `openssl rand -base64 32`. | — |

The Vite consoles (`apps/admin-react[-workspaces]`) take `VITE_AUTH_API_URL` instead; the
mobile apps take `EXPO_PUBLIC_API_BASE_URL` (Expo) / `API_BASE_URL` in `.env` (bare RN).

### Backend environment variables (example apps)

| Var | What |
|---|---|
| `DATABASE_URL` | Postgres connection string (checked-in `.env` points at `localhost:55432`) |
| `AUTH_JWT_SECRET` | Access/refresh token signing secret — base64, 256-bit+. No default; the app refuses to start without it. |
| `PORT` | Listen port (each example has its own fallback, 3001–3008) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Seeder-only: create the initial admin |
| `SEED_WORKSPACE_NAME` | Seeder-only, workspaces variant: name of the first workspace (default "Default workspace") |
| `DOCS_USERNAME` / `DOCS_PASSWORD` | Basic-Auth gate on the docs UIs, enforced only when `NODE_ENV=production` |

## Port map

| Port | Service |
|---|---|
| 3000 | `apps/admin-nextjs` (console for 3001) |
| 3001–3004 | base-variant backends: nestjs-prisma, nestjs-drizzle, express-prisma, express-drizzle |
| 3005–3008 | workspaces-variant backends (same order) |
| 3010 | `apps/admin-nextjs-workspaces` (console for 3005) |
| 5173 / 5174 | `apps/admin-react` / `-workspaces` (consoles for 3001 / 3005) |
| 8080 | `apps/dev-portal` (`pnpm portal`, host-only — service status, ER diagram, schema drift) |
| 55432 | your local Postgres (manual path) |

Every backend port is a fallback, not a requirement — each app's `src/main.ts` reads
`process.env.PORT` first.

## The workspaces variant's extra step

On a workspaces-variant backend (3005–3008), a caller has no roles until they belong to a
workspace. `POST /workspaces` (no `X-Workspace-Id` needed — it acts outside every workspace)
makes the caller that workspace's first admin; the seeder does this automatically for the
seeded admin. Admin API calls then carry the acting workspace as an `X-Workspace-Id` header —
the consoles' workspace picker handles this for you.

## First things to try once you're in

- **Dashboard** — stat cards, recent audit activity, and the *Live activity* card: leave it
  open, log in from a second browser/incognito window, and watch the `session_created` event
  arrive over the socket (nestjs-prisma base backend only — it's the one with the gateway).
- **Users → Add user** — create a user, assign roles via the multi-select, upload a photo
  (drag & drop).
- **Roles** — create a role and tick permissions in the grouped grid; saves are diff-based
  attach/detach.
- **Countries / Languages / Customers** — the same CRUD patterns over the content domains.
- **API docs** — http://localhost:3001/docs (Swagger; every backend has this) and
  http://localhost:3001/reference (Scalar; reference backend only).
