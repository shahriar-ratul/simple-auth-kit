# easy-auth

A shadcn-style auth library: source lives in `registry/`, a CLI copies it into consumer
projects (`easy-auth add <combo> [--workspaces]`). Three kinds of installable product —
backend combos (`api`), admin consoles (`admin`), and mobile apps (`mobile`) — each in a
**base** and a **workspaces** variant. This repo also contains a full reference deployment:
8 runnable example backends, 4 admin consoles, 4 mobile apps, a shared typed API client, and
a dev portal watching all of it.

**New here? Start with [`docs/`](docs/README.md)** — getting started (clone → running login),
architecture, the CLI, the full backend API reference, the admin console internals, and the
development workflows. This README stays the operational quick reference.

## Repo structure

| Path | What it is |
|---|---|
| `registry/core/` | Framework/ORM-free auth logic (sessions, JWTs, 2FA, OAuth, password reset, RBAC). Never installed as a dependency — copied verbatim by the CLI. |
| `registry/combos/{nestjs-prisma,nestjs-drizzle,express-prisma,express-drizzle}/` | The 4 `api` products: framework+ORM wiring around `registry/core/`, each with a `base` and a `workspaces` variant. `nestjs-prisma` is the reference combo. Merged into an existing project's `src/lib/auth`. |
| `registry/admin-apps/{nextjs,react}/` | The 2 `admin` products: whole admin-console apps, scaffolded standalone into a target directory. Extracted from (and mirrored by) `apps/admin-*`. |
| `registry/mobile-apps/{expo,bare-rn}/` | The 2 `mobile` products: whole React Native apps, scaffolded standalone. `bare-rn` gets per-app native identity (bundle id / applicationId) retemplated by the CLI. |
| `cli/` | The `easy-auth` CLI (`init`, `add`, `diff`) + `registry.json` product manifest. Multi-kind runs namespace each product into its own subdirectory. See `docs/cli.md`. |
| `examples/{nestjs-prisma,nestjs-drizzle,express-prisma,express-drizzle}-app[-workspaces]/` | Fresh consumer projects, each demonstrating `easy-auth add <combo> [--workspaces]` end to end — 8 in total. These are the **runnable backends**. |
| `packages/auth-client/` | Shared, framework-agnostic API client used by all 8 client apps below (`@easy-auth/auth-client`, consumed from `dist/`). |
| `apps/admin-nextjs[-workspaces]/`, `apps/admin-react[-workspaces]/` | The 4 admin consoles — users, roles & permissions, audit log, content domains, 2FA, live activity feed. `apps/admin-nextjs` is the reference console (NextAuth v5 + edge `proxy.ts` guard; the other three re-verify sessions client-side per navigation — a deliberate split, see `docs/admin-console.md`). |
| `apps/mobile-expo[-workspaces]/`, `apps/mobile-bare-rn[-workspaces]/` | End-user mobile apps — login, 2FA, sessions — two React Native toolchains, each in base and workspaces versions. |
| `apps/dev-portal/` | Next.js control panel for this repo (`pnpm portal`, port 8080): live per-service status with start/stop/restart, plus an ER diagram + schema-drift table built by replaying every combo's migrations into a throwaway database. For working on this repo — never shipped to consumers. |
| `docs/` | The documentation set. Start at `docs/README.md`. |
| `plan/brief.md` | Settled decisions, current state, and remaining work — read before changing anything architectural. `plan/plan.md` is the executed 2026-08-12 parity build plan with its verification record. |

## Installing into your own project

Distribution model matches shadcn/ui: nothing is ever installed as a runtime dependency, source
is copied. Once linked, usage is a single command run from inside your own project:

```bash
cd cli && npm link                    # once — registers a global `easy-auth` command
cd ~/your-project
easy-auth add nestjs-prisma           # or any combo below, optionally --workspaces
```

No `--into` needed — it already defaults to the current directory. Prefer not to link? The
unlinked form works identically: `npx tsx <path-to-this-repo>/cli/easy-auth.ts add <combo>`.

| Kind | Combos | Installs as |
|---|---|---|
| `api` (backend) | `nestjs-prisma`, `nestjs-drizzle`, `express-prisma`, `express-drizzle` | merged into `src/lib/auth` of an existing project |
| `admin` | `admin-nextjs`, `admin-react` | a whole new standalone app, scaffolded at the target |
| `mobile` | `mobile-expo`, `mobile-bare-rn` | a whole new standalone app, scaffolded at the target |

Add `--workspaces` to any of them for the workspaces variant. Run `easy-auth add` with no combo
name for a guided prompt (pick kind, framework, variant); run `easy-auth` alone for the full
command/flag reference. Every install prints its own next steps — env vars to set, the migration
command, seeding. Full details: `docs/cli.md`. A fully-verified walkthrough with real terminal
output for all 16 combo×variant combinations: `docs/cli-generation-guide.html`.

## Prerequisites

- Node.js (built/verified on v26; anything reasonably recent should work)
- [pnpm](https://pnpm.io/) (built/verified on v11)
- A local PostgreSQL server reachable at **`localhost:55432`** with a passwordless `postgres`
  superuser (that's what every `.env` in this repo points at). Easiest way to get that:
  ```bash
  docker run -d --name easy-auth-postgres -p 55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
  ```
  (Already have Postgres running elsewhere? Just repoint the `DATABASE_URL` in whichever
  `.env` files you're using instead.)
- For the mobile apps' actual native builds: Xcode (iOS) and/or Android Studio/SDK (Android).
  Not required for backend/web work.

## Quick start

```bash
# 1. Install everything (registry, cli, packages, apps — one pnpm workspace)
pnpm install

# 2. Create the databases (registry combos use auth_reference*, examples use example_*)
for db in auth_reference auth_reference_workspaces \
          example_nestjs_prisma example_nestjs_drizzle example_express_prisma example_express_drizzle \
          example_nestjs_prisma_workspaces example_nestjs_drizzle_workspaces \
          example_express_prisma_workspaces example_express_drizzle_workspaces; do
  psql -h localhost -p 55432 -U postgres -c "CREATE DATABASE $db" 2>/dev/null
done

# 3. Run the reference backend (what the base-variant client apps talk to)
cd examples/nestjs-prisma-app
(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npx tsx src/lib/auth/src/seed.ts
npm run start
# -> http://localhost:3001 (PORT env var overrides); Swagger UI at /docs, Scalar at /reference
```

**Seeding is required, not optional** — a freshly migrated database has no permission catalog,
no roles, and no users, so nothing is authorized until `seed.ts` has run once. It's idempotent.

In a second terminal, run whichever client app you want (see below) — the base-variant ones
default to `http://localhost:3001`, no config needed for local dev. The workspaces backends
live in parallel on 3005–3008; their admin routes additionally require an `X-Workspace-Id`
header (the consoles' workspace picker handles it).

## Run everything with Docker

One-command alternative — Postgres, all 8 backends, all 4 admin consoles:

```bash
cp .env.example .env         # fill in every secret: openssl rand -base64 32 each
docker compose up --build    # or: make up-build (see `make help` for all targets)
```

Then seed whichever backends you'll use (compose migrates but does not seed):

```bash
docker exec -e SEED_ADMIN_EMAIL=admin@example.com -e SEED_ADMIN_PASSWORD='Admin12345!' \
  library-nestjs-prisma-app-1 sh -c 'node_modules/.bin/tsx src/lib/auth/src/seed.ts'
```

| Service | Port | Notes |
|---|---|---|
| `postgres` | — (not published to the host) | `postgres:16`, trust auth, 8 `example_*` databases created on first boot via `docker/postgres-init/`. Internal-only, on purpose — won't collide with a host Postgres on `localhost:55432`. |
| `nestjs-prisma-app` | [3001](http://localhost:3001) | The reference combo, base variant. |
| `nestjs-drizzle-app` | [3002](http://localhost:3002) | |
| `express-prisma-app` | [3003](http://localhost:3003) | |
| `express-drizzle-app` | [3004](http://localhost:3004) | |
| `nestjs-prisma-app-workspaces` | [3005](http://localhost:3005) | The reference combo, workspaces variant. |
| `nestjs-drizzle-app-workspaces` | [3006](http://localhost:3006) | |
| `express-prisma-app-workspaces` | [3007](http://localhost:3007) | |
| `express-drizzle-app-workspaces` | [3008](http://localhost:3008) | |
| `admin-nextjs` | [3000](http://localhost:3000) | `next dev`, points at `nestjs-prisma-app` (3001). |
| `admin-react` | [5173](http://localhost:5173) | `vite` dev server, points at 3001. |
| `admin-nextjs-workspaces` | [3010](http://localhost:3010) | `next dev`, points at 3005. |
| `admin-react-workspaces` | [5174](http://localhost:5174) | `vite` dev server, points at 3005. |

Every backend serves Swagger UI at `/docs`. Each backend's entrypoint applies its migrations
at container startup (gated on Postgres's healthcheck); `DATABASE_URL`/`PORT` come from each
service's `environment:` block, and secrets are interpolated from the gitignored root `.env` —
compose refuses to start with them unset. The admin apps run in dev mode with the repo root
as build context (they compile `@easy-auth/auth-client` from source).

Not included: the mobile apps (need a simulator/device — see below), `registry/*` (library
source, not a deployable app), and `cli/` (a tool, not a service).

```bash
docker compose down          # stop everything (add -v to also drop the Postgres volume)
```

## The dev portal

```bash
pnpm portal                  # -> http://localhost:8080
```

A Next.js app under `apps/dev-portal/`, run on the host (not in compose — a portal inside
compose would kill itself on "Stop all", and mounting the Docker socket into a container
effectively grants host root). Three things:

1. **Every surface in this repo, with live status** — the 8 backends as framework × ORM
   matrices, the 4 consoles, both mobile families, Postgres — each with Start/Stop/Restart
   buttons that shell out to `docker compose`. It distinguishes *responding* from *running in
   Docker*: a backend you started by hand shows as **Outside Docker**.
2. **An ER diagram of the auth schema**, built by replaying each combo's migration files into
   a throwaway Postgres database and introspecting the result — never by parsing SQL in JS —
   so an `ALTER TABLE` in a later migration counts exactly as much as the `CREATE TABLE` it
   amends. Needs Postgres running; it never falls back to a less accurate answer.
3. **Schema drift across the 4 combos** — every column compared across all four; disagreements
   (type, nullability, missing) are highlighted in the diagram and listed. Currently **0 of 87
   columns** drift.

The endpoints are curl-able JSON/SVG (`/api/status`, `/api/schema`, `/api/schema/diagram`,
POST `/api/action`). Hardening: bound to `127.0.0.1`, service names and action verbs checked
against fixed allowlists, `docker` invoked with argument arrays (never a shell string),
cross-origin POSTs refused, request bodies capped at 4 KB.

## Backend: `registry/combos/*` and `examples/*`

`registry/combos/*` is **library source**, not a deployable app (no `main.ts`) — it has its
own black-box test (`npm run prove-cycle`) that boots a temporary instance and verifies the
full auth flow. `examples/*` are what you actually run: real consumer apps that installed a
combo via the CLI.

| Combo | Base example / port / db | Workspaces example / port / db |
|---|---|---|
| `nestjs-prisma` | `nestjs-prisma-app` · 3001 · `example_nestjs_prisma` | `nestjs-prisma-app-workspaces` · 3005 · `example_nestjs_prisma_workspaces` |
| `nestjs-drizzle` | `nestjs-drizzle-app` · 3002 · `example_nestjs_drizzle` | `nestjs-drizzle-app-workspaces` · 3006 · `example_nestjs_drizzle_workspaces` |
| `express-prisma` | `express-prisma-app` · 3003 · `example_express_prisma` | `express-prisma-app-workspaces` · 3007 · `example_express_prisma_workspaces` |
| `express-drizzle` | `express-drizzle-app` · 3004 · `example_express_drizzle` | `express-drizzle-app-workspaces` · 3008 · `example_express_drizzle_workspaces` |

To run any of them:
```bash
cd examples/<app>
# Prisma combos:
(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
# Drizzle combos:
(cd src/lib/auth && npx drizzle-kit migrate)

npm run seed        # required once per database — see the seeding note above
npm run start
```

To work on the **library source** itself:
```bash
cd registry/combos/nestjs-prisma
npm run migrate -- base --name <name>   # author a migration (against auth_reference)
npm run typecheck                       # both variants
npm run prove-cycle                     # black-box test, both variants, 300+ assertions
```

After changing anything in `registry/core/` or a combo, re-sync any `examples/*-app` you're
using (the CLI copy is a snapshot, not a live symlink):
```bash
cd cli && npx tsx easy-auth.ts add <combo> [--workspaces] --force --into ../examples/<app>
```

## `packages/auth-client`

Shared TypeScript client all 8 client apps import (`@easy-auth/auth-client`, workspace
package). It's compiled to `dist/` (not consumed as raw TS) — rebuild after changing it:
```bash
cd packages/auth-client
npm run typecheck && npm test && npm run build   # build -> dist/, what the apps actually import
```

## The 8 client apps

None of these need a database — they only talk to a running backend over HTTP. Four app types
(2 admin consoles, 2 mobile), each in a **base** version (points at 3001) and a
**-workspaces** version (points at 3005). A consumer installs one variant, not both — matching
how the CLI treats a variant as an install-time choice, not a runtime mode.

The workspaces apps carry one extra concept: an **active workspace**, whose id is sent as
`X-Workspace-Id` on admin routes. A newly-authenticated user with no workspace lands on a
picker (create or join) before the rest of the app is reachable.

### `apps/admin-nextjs` / `apps/admin-nextjs-workspaces` (Next.js, MobX, CASL, Tailwind)
```bash
cd apps/admin-nextjs                 # or apps/admin-nextjs-workspaces
cp .env.example .env.local           # NEXT_PUBLIC_AUTH_API_URL; admin-nextjs also needs AUTH_SECRET
npm run dev                          # -> http://localhost:3000 (base) / :3010 (workspaces)
```
`apps/admin-nextjs` (base) requires `AUTH_SECRET` (NextAuth session signing — `openssl rand
-base64 32`) and honors `AUTH_API_INTERNAL_URL` when its server side reaches the backend at a
different address than the browser does (docker compose sets both). Details:
`docs/admin-console.md`.

### `apps/admin-react` / `apps/admin-react-workspaces` (Vite + bare React, MobX, CASL, Tailwind)
```bash
cd apps/admin-react                  # or apps/admin-react-workspaces
npm run dev                          # -> http://localhost:5173 (base) / :5174 (workspaces)
# repoint the backend via VITE_AUTH_API_URL in a .env file if not using the default
```

### `apps/mobile-expo` / `apps/mobile-expo-workspaces` (Expo, Zustand)
```bash
cd apps/mobile-expo                  # or apps/mobile-expo-workspaces
npm run start                        # Metro; then press i / a / w, or scan the QR code with Expo Go
# EXPO_PUBLIC_API_BASE_URL env var to repoint the backend — for an Android emulator use
# http://10.0.2.2:<port> instead of localhost (the emulator's alias for the host machine)
```

### `apps/mobile-bare-rn` / `apps/mobile-bare-rn-workspaces` (bare React Native CLI, Zustand)
```bash
cd apps/mobile-bare-rn                # or apps/mobile-bare-rn-workspaces
npm run ios       # or: npm run android
# API_BASE_URL is set in .env (react-native-config) — same localhost/10.0.2.2/LAN-IP notes as above
```

iOS note: `react-native-config`'s Xcode build-phase script isn't wired into the `.pbxproj` yet
(needs a one-time manual Xcode step) — the JS side works, but reading `Config.API_BASE_URL` on
iOS needs that first. The two in-repo bare-RN apps also share one native project identity, so
installing both on one device needs a manual rename — the CLI-generated apps don't have this
problem (the scaffolder retemplates native identity per app, see `registry/mobile-apps/README.md`).

## Full workspace checks

```bash
pnpm -r typecheck   # every package + app
pnpm -r test        # vitest suites: registry/core (56), packages/auth-client (36)
```

## Known gaps

- **Feature footprint is uneven by design** — content domains (countries/languages/customers)
  exist in `nestjs-prisma` only (both variants); the socket.io live feed and HTTP throttling
  in its base variant only; `dob`/`gender`/`joinedDate` in the NestJS combos only. All 4
  combos carry the full auth/RBAC/admin surface and are individually verified. See the parity
  map in `docs/architecture.md`.
- `docker compose up` migrates but does **not** seed — run the seeder per backend before
  expecting a login to work.
- The CLI's `diff` command is a stub; scaffolded apps depend on the unpublished
  `@easy-auth/auth-client` (`workspace:*`) and won't install outside this monorepo as-is.
- Mobile apps are verified via typecheck, bundling, and Metro/Expo boot — do your own device
  smoke test before relying on them. `AsyncStorage` is unencrypted-at-rest by deliberate,
  documented choice (`plan/brief.md`; `TokenStorage` is an injected interface, so upgrading to
  `expo-secure-store`/Keychain later doesn't touch call sites).
