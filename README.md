# easy-auth

A shadcn-style auth library: source lives in `registry/`, a CLI copies it into consumer
projects (`easy-auth add <combo> [--workspaces]`), and this repo also contains a full reference
deployment — 4 backend combos (each in a **base** and a **workspaces** variant, 8 runnable
backends total), 8 example consumer apps, and 8 client apps (4 admin consoles, 4 mobile) built
against them.

**New here? Start with [`docs/`](docs/README.md)** — getting started (clone → running login),
architecture, the full backend API reference, the admin console internals, and the development
workflows. This README stays the operational quick reference.

## Repo structure

| Path | What it is |
|---|---|
| `registry/core/` | Framework/ORM-free auth logic (sessions, JWTs, 2FA, OAuth, password reset, RBAC). Never installed as a dependency — copied verbatim by the CLI. |
| `registry/combos/{nestjs-prisma,nestjs-drizzle,express-prisma,express-drizzle}/` | Framework+ORM wiring around `registry/core/`, each with a `base` and a `workspaces` variant. `nestjs-prisma` is the reference combo; the other 3 mirror it. |
| `cli/` | The `easy-auth` CLI (`add`, `init`, `diff`) — copies `registry/` source into a target repo. `add <combo> --workspaces` emits the workspace-aware variant; omitted, the base (global roles) variant is the default. |
| `examples/{nestjs-prisma,nestjs-drizzle,express-prisma,express-drizzle}-app[-workspaces]/` | Fresh consumer projects, each demonstrating `easy-auth add <combo> [--workspaces]` end to end — 8 in total. These are the **runnable backends**. |
| `packages/auth-client/` | Shared, framework-agnostic API client used by all 8 client apps below. |
| `apps/admin-nextjs[-workspaces]/`, `apps/admin-react[-workspaces]/` | Admin console — users, roles & permissions, audit log, 2FA — two frontend stacks (Next.js vs. bare React/Vite), each in a base and a workspace-aware version. `apps/admin-nextjs` is the reference console: it additionally carries NextAuth v5 session orchestration + an edge `proxy.ts` route guard, countries/languages/customers CRUD, and a realtime audit feed (see `docs/admin-console.md`). |
| `apps/mobile-expo[-workspaces]/`, `apps/mobile-bare-rn[-workspaces]/` | End-user mobile app — same feature set (login, 2FA, sessions), two different React Native toolchains (Expo vs. bare RN CLI), each in a base and a workspace-aware version. |
| `apps/dev-portal/` | Next.js control panel for this repo (`pnpm portal`, port 8080): live status and start/stop/restart per compose service, plus the auth schema drawn from the migration files with the columns the 4 combos disagree on. For working on this repo — not part of the library, never shipped to consumers. |
| `docs/` | The documentation set: getting started, architecture, backend API reference, admin console internals, development workflows. Start at `docs/README.md`. |
| `plan/brief.md` | Settled decisions, current state, and remaining work — read before changing anything architectural. `plan/plan.md` is the executed 2026-08-12 parity build plan with its verification record. |

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
for db in auth_reference auth_reference_drizzle auth_reference_express_prisma auth_reference_express_drizzle \
          example_nestjs_prisma example_nestjs_drizzle example_express_prisma example_express_drizzle \
          example_nestjs_prisma_workspaces example_nestjs_drizzle_workspaces \
          example_express_prisma_workspaces example_express_drizzle_workspaces; do
  psql -h localhost -p 55432 -U postgres -c "CREATE DATABASE $db" 2>/dev/null
done

# 3. Run the reference backend (this is what the base-variant client apps talk to)
cd examples/nestjs-prisma-app
npx prisma migrate deploy --schema src/lib/auth/prisma/schema.prisma   # or: cd src/lib/auth && npx prisma migrate deploy
npm run start
# -> listening on http://localhost:3001 (PORT env var overrides)
# -> Swagger UI (interactive API docs) at http://localhost:3001/docs, spec at /docs-json
```

In a second terminal, run whichever client app you want (see below) — the base-variant ones
default to `http://localhost:3001` already, no config needed for local dev. The workspaces
variant lives in parallel on 3005 — see [Backend: `registry/combos/*` and `examples/*`](#backend-registrycombos-and-examples)
for the full port map.

The workspaces variant needs one extra step before it authorizes anything: a caller has no
roles until it belongs to a workspace. `POST /workspaces` (no `X-Workspace-Id` needed — it acts
outside every workspace) makes the caller its first admin; the seeder does this automatically
for the seeded admin (see `SEED_WORKSPACE_NAME`).

## Run everything with Docker

One-command alternative to the manual `pnpm install` / per-app migrate / `npm run start`
steps above — brings up Postgres, all 8 backends, and all 4 admin web apps:

```bash
docker compose up --build
```

Or drive it from the dev portal instead — `pnpm portal`, then
**[localhost:8080](http://localhost:8080)**. It indexes every surface below, shows what's
actually running, and has start/stop/restart buttons per service (see
[The dev portal](#the-dev-portal)).

| Service | Port | Notes |
|---|---|---|
| `postgres` | — (not published to the host) | `postgres:16`, trust auth, 8 `example_*` databases created on first boot via `docker/postgres-init/`. Internal-only, on purpose — won't collide with a host Postgres on `localhost:55432`. |
| `nestjs-prisma-app` | [3001](http://localhost:3001) | Swagger UI at `/docs`. The reference combo, base variant. |
| `nestjs-drizzle-app` | [3002](http://localhost:3002) | Swagger UI at `/docs`. |
| `express-prisma-app` | [3003](http://localhost:3003) | Swagger UI at `/docs`. |
| `express-drizzle-app` | [3004](http://localhost:3004) | Swagger UI at `/docs`. |
| `nestjs-prisma-app-workspaces` | [3005](http://localhost:3005) | Swagger UI at `/docs`. The reference combo, workspaces variant. |
| `nestjs-drizzle-app-workspaces` | [3006](http://localhost:3006) | Swagger UI at `/docs`. |
| `express-prisma-app-workspaces` | [3007](http://localhost:3007) | Swagger UI at `/docs`. |
| `express-drizzle-app-workspaces` | [3008](http://localhost:3008) | Swagger UI at `/docs`. |
| `admin-nextjs` | [3000](http://localhost:3000) | `next dev`, points at `nestjs-prisma-app` (`localhost:3001`). |
| `admin-react` | [5173](http://localhost:5173) | `vite` dev server, points at `nestjs-prisma-app` (`localhost:3001`). |
| `admin-nextjs-workspaces` | [3010](http://localhost:3010) | `next dev`, points at `nestjs-prisma-app-workspaces` (`localhost:3005`). |
| `admin-react-workspaces` | [5174](http://localhost:5174) | `vite` dev server, points at `nestjs-prisma-app-workspaces` (`localhost:3005`). |

Each backend's `Dockerfile` runs its migration tooling (`prisma migrate deploy` /
`drizzle-kit migrate`) from an entrypoint script at container startup, gated on Postgres's
own healthcheck (`depends_on: condition: service_healthy`) — not at image build time, since
Postgres isn't reachable during `docker build`. `DATABASE_URL` and `PORT` are set via each
service's `environment:` block — `DATABASE_URL` points at the `postgres` service on the
compose network, overriding the `localhost:55432` value baked into each app's checked-in
`.env` (dotenv never overwrites an already-set process env var); `PORT` is explicit per
service even though it matches each app's own hardcoded fallback, so the compose file states
the port assignment rather than relying on it implicitly agreeing with `src/main.ts`.

The admin apps run in **dev mode**, not a production build — `apps/admin-nextjs` and
`apps/admin-react/Dockerfile` build with the repo root as context (not the app subdir),
since both depend on `@easy-auth/auth-client` via `workspace:*`, which has to be compiled
from source (`pnpm --filter @easy-auth/auth-client build`) rather than consumed as raw TS.

Not included — same as the non-Docker setup, these need a simulator/device or aren't a
runnable service:
- `apps/mobile-expo[-workspaces]`, `apps/mobile-bare-rn[-workspaces]` — use the native run
  commands documented below.
- `registry/*` — library source, not a deployable app (`prove-cycle` is its own test, not
  part of "running" anything).
- `cli/` — a CLI tool, not a service.

```bash
docker compose down          # stop everything (add -v to also drop the Postgres volume)
```

## The dev portal

```bash
pnpm portal                  # -> http://localhost:8080
```

A Next.js app (App Router, TypeScript) under `apps/dev-portal/`. `pnpm portal` runs
`next dev -H 127.0.0.1 -p 8080` for it. Three things:

**1. Every surface in this repo, with live status.** The 8 backends as two framework × ORM
matrices (base variant, workspaces variant), all 4 admin consoles, both mobile app families, and
Postgres. Each one shows whether it's running and gives you **Start**, **Stop**, and
**Restart** — plus **Start all** / **Stop all** / **Restart all** in the header. The buttons
shell out to `docker compose` in this directory.

**2. An ER diagram of the auth schema.** Built from each combo's *migration files* — but by
**replaying them into a throwaway Postgres database and introspecting the result**, not by
parsing the SQL in JS. So it shows what the repo declares rather than what someone migrated by
hand, and an `ALTER TABLE ... ADD COLUMN` in a later migration counts for exactly as much as the
`CREATE TABLE` it amends. (Parsing was the original design and it was wrong: `@dbml/core`'s
importer reads only `CREATE TABLE`, so every column added by a later migration was reported as
*missing*.) Prisma combos apply the `migration.sql` in each migration directory in order;
Drizzle combos follow `meta/_journal.json` (deliberately not a `*.sql` glob — see the
orphaned-file warning the portal itself raises). Each combo replays into its own
`devportal_replay_scratch_*` database with `psql -v ON_ERROR_STOP=1`, which is dropped again
whether the replay succeeded or failed; the `example_*` databases are never touched. The
introspected schema is then handed to `@dbml/core` and `@softwaretechnik/dbml-renderer`, which
lays it out with graphviz, bundled as wasm, so there's no system graphviz to install.

**This means the Schema band needs Postgres running** — the price of an answer that is actually
true. With Postgres stopped it says "Start Postgres to compare schemas" and gives you the
button; it never quietly falls back to a less accurate schema.

**3. Schema drift across the 4 combos.** Every column is compared across all four, and the ones
they disagree on — different type, different nullability, or missing entirely — are highlighted
in the diagram and listed underneath it. As of now that's **0 of 87 columns**: the CASL
migration's join-table model (`roles`, `permissions`, `role_user`, `permission_role`,
`permission_user`) replaced the old `User.roles` string array that used to be the one drifting
column, and all four combos agree on every column's type and nullability.

The three endpoints are plain JSON/SVG and are meant to be curl-able:

```bash
curl -s localhost:8080/api/status | jq
curl -s localhost:8080/api/schema | jq '{tableCount, columnCount, driftCount, unavailable, warnings}'
curl -s 'localhost:8080/api/schema?refresh=1' | jq '.driftCount'   # replay again, ignore the cache
curl -s 'localhost:8080/api/schema/diagram?combo=nestjs-drizzle' -o schema.svg
curl -s -X POST localhost:8080/api/action \
  -H 'content-type: application/json' -d '{"service":"postgres","action":"restart"}'
```

It runs on the host rather than as a compose service, on purpose:

- A portal inside compose would kill itself on "Stop all".
- Controlling Docker from inside a container means mounting the Docker socket, which
  effectively grants host root. Not a thing to add to a repo for a convenience panel.

It's a local tool and is wired to stay one: bound to `127.0.0.1` only, service names and action
verbs checked against fixed allowlists before any command runs (so no arbitrary container or
flag can be smuggled in), `docker` always invoked with an argument array rather than a shell
string — `execFile` for the service controls, `spawn` for the schema replay, which pipes
migration SQL to `psql` over stdin so nothing in a file can be read as a flag — cross-origin
POSTs refused so a random website can't restart your stack in the background, and request
bodies capped at 4 KB.

The portal also distinguishes *responding* from *running in Docker* — if you started a backend
by hand with `npm run start`, it shows as **Outside Docker**, since the buttons won't manage it.

## Backend: `registry/combos/*` and `examples/*`

`registry/combos/*` is **library source**, not a deployable app by itself (no `main.ts`) — it
has its own black-box test (`npm run prove-cycle`) that boots a temporary instance to verify the
full auth flow. `examples/*` are what you actually run: real consumer apps that installed a
combo via the CLI and have a `src/main.ts` entrypoint.

Per combo/example — base variant (roles/permissions global to the deployment):

| Combo | Example app | Port | Database |
|---|---|---|---|
| `nestjs-prisma` | `examples/nestjs-prisma-app` | 3001 | `example_nestjs_prisma` |
| `nestjs-drizzle` | `examples/nestjs-drizzle-app` | 3002 | `example_nestjs_drizzle` |
| `express-prisma` | `examples/express-prisma-app` | 3003 | `example_express_prisma` |
| `express-drizzle` | `examples/express-drizzle-app` | 3004 | `example_express_drizzle` |

Workspaces variant (`easy-auth add <combo> --workspaces`; a user belongs to many workspaces and
holds different roles in each; requests act inside one, named by an `X-Workspace-Id` header):

| Combo | Example app | Port | Database |
|---|---|---|---|
| `nestjs-prisma` | `examples/nestjs-prisma-app-workspaces` | 3005 | `example_nestjs_prisma_workspaces` |
| `nestjs-drizzle` | `examples/nestjs-drizzle-app-workspaces` | 3006 | `example_nestjs_drizzle_workspaces` |
| `express-prisma` | `examples/express-prisma-app-workspaces` | 3007 | `example_express_prisma_workspaces` |
| `express-drizzle` | `examples/express-drizzle-app-workspaces` | 3008 | `example_express_drizzle_workspaces` |

Every port above is a fallback, not a fixed requirement — each app's `src/main.ts` reads
`process.env.PORT` first, so `PORT=4001 npm run start` (or `docker-compose.yml`'s explicit
`PORT:` per service) overrides it without touching source.

To run any of them:
```bash
cd examples/<app>
# Prisma combos: generate client + apply migrations first
cd src/lib/auth && npx prisma generate && npx prisma migrate deploy && cd ../../..
# Drizzle combos: apply migrations first
cd src/lib/auth && npx drizzle-kit migrate && cd ../../..

npm run start
```
The seeder is a prerequisite, not an extra — nothing is authorized until it has run at least
once (it provisions the permission catalog and default roles, and seeds an initial admin from
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` if set). It's idempotent:
```bash
npm run seed
```
The workspaces variant's seeder also provisions a first workspace (`SEED_WORKSPACE_NAME`,
defaults to "Default workspace") and makes the seeded admin its first member.

To work on the **library source** itself (`registry/combos/nestjs-prisma`, the reference combo):
```bash
cd registry/combos/nestjs-prisma
npx prisma migrate dev        # apply schema changes to auth_reference
npm run typecheck
npm run prove-cycle           # black-box test: signup, login, 2FA, RBAC, OAuth-shaped flows, audit log, password reset — 300+ assertions across both variants
```
The other 3 combos follow the same shape (swap `prisma migrate dev` for `drizzle-kit generate && drizzle-kit migrate` on the Drizzle ones).

After changing anything in `registry/core/` or a combo, re-sync any `examples/*-app` you're
using so it picks up the change (the CLI copy is a snapshot, not a live symlink):
```bash
cd cli && npx tsx easy-auth.ts add <combo> --into ../examples/<app>
```

## `packages/auth-client`

Shared TypeScript client all 8 apps import (`@easy-auth/auth-client`, workspace package). It's
compiled to `dist/` (not consumed as raw TS) — rebuild after changing it:
```bash
cd packages/auth-client
npm run typecheck
npm run test        # vitest, mocked fetch
npm run build        # -> dist/, what the 8 apps actually import
```

## The 8 client apps

None of these need a database — they only talk to a running backend over HTTP. Four app types
(2 admin consoles, 2 mobile), each in a **base** version (points at the plain-variant backend,
no workspace concept) and a **-workspaces** version (points at the workspaces-variant backend).
A consumer installs one variant, not both — the `-workspaces` apps in this repo are a deliberate
copy of their base counterpart, not a shared abstraction, matching how the CLI itself treats a
variant as a install-time choice rather than a runtime mode.

The workspaces apps carry one extra concept the base apps don't: an **active workspace**, the
one whose id gets sent as `X-Workspace-Id` on admin routes. `GET /auth/me` answers with that
workspace's roles and permissions, not the deployment's — being an admin in one workspace says
nothing about any other. A newly-authenticated user with no workspace lands on a picker (create
one or join an existing one) before the rest of the app is reachable.

### `apps/admin-nextjs` / `apps/admin-nextjs-workspaces` (Next.js, MobX, CASL, Tailwind)
```bash
cd apps/admin-nextjs                 # or apps/admin-nextjs-workspaces
cp .env.example .env.local           # NEXT_PUBLIC_AUTH_API_URL; admin-nextjs also needs AUTH_SECRET
npm run dev                          # -> http://localhost:3000 (base) / :3010 (workspaces)
```
Base defaults to `http://localhost:3001`; workspaces defaults to `http://localhost:3005`.
`apps/admin-nextjs` (base) requires `AUTH_SECRET` (NextAuth session signing — `openssl rand
-base64 32`), and honors `AUTH_API_INTERNAL_URL` when its server side reaches the backend at a
different address than the browser does (docker compose sets both). Details:
`docs/admin-console.md`.

### `apps/admin-react` / `apps/admin-react-workspaces` (Vite + bare React, MobX, CASL, Tailwind)
```bash
cd apps/admin-react                  # or apps/admin-react-workspaces
npm run dev                          # -> http://localhost:5173 (base) / :5174 (workspaces)
# repoint the backend via VITE_AUTH_API_URL in a .env file if not using the default
```
Base defaults to `http://localhost:3001`; workspaces defaults to `http://localhost:3005`.

### `apps/mobile-expo` / `apps/mobile-expo-workspaces` (Expo, Zustand)
```bash
cd apps/mobile-expo                  # or apps/mobile-expo-workspaces
npm run start                        # Metro; then press i / a / w, or scan the QR code with Expo Go
# EXPO_PUBLIC_API_BASE_URL env var to repoint the backend — for an Android emulator use
# http://10.0.2.2:<port> instead of localhost (the emulator's alias for the host machine)
```
Base defaults to `http://localhost:3001`; workspaces defaults to `http://localhost:3005`.

### `apps/mobile-bare-rn` / `apps/mobile-bare-rn-workspaces` (bare React Native CLI, Zustand)
```bash
cd apps/mobile-bare-rn                # or apps/mobile-bare-rn-workspaces
npm run ios       # or: npm run android
# API_BASE_URL is set in .env (react-native-config) — same localhost/10.0.2.2/LAN-IP notes as above
```
Base defaults to `http://localhost:3001`; workspaces defaults to `http://localhost:3005`.

iOS note: `react-native-config`'s Xcode build-phase script isn't wired into the `.pbxproj` yet
(needs to be added by hand in Xcode) — the JS side works, but reading `Config.API_BASE_URL` on
iOS specifically needs that one-time Xcode step first. Applies to both `mobile-bare-rn` and
`mobile-bare-rn-workspaces`; the two also currently share one native project identity (bundle
ID / Android `applicationId` / AppRegistry component name aren't deduplicated), so running both
side by side on the same simulator/device needs a manual rename first — fine for Metro-level
dev work, not yet for installing both at once.

## Full workspace checks

```bash
pnpm -r typecheck   # every package + app
pnpm -r test        # vitest suites (registry/core, packages/auth-client)
```

## Known gaps

- Only `nestjs-prisma` (both variants) is what the 8 client apps actually point at by
  convention; the other 3 combos have the identical backend feature set — RBAC, 2FA, OAuth,
  audit log, workspaces — and are individually verified (typecheck + boot + a full login/CASL
  smoke test), but weren't wired up as any client app's default target.
- Mobile apps haven't had a real simulator/device run in every environment this was built in —
  verified via typecheck, bundling, and Metro/Expo boot; do your own device smoke test before
  relying on them. `mobile-bare-rn-workspaces` additionally shares its native project identity
  (Xcode bundle ID, Android `applicationId`) with `mobile-bare-rn` — see the client apps section
  above.
- `AsyncStorage` (all 4 mobile apps) is unencrypted-at-rest by deliberate choice, not an
  oversight — see the decision log in `plan/brief.md` for the tradeoff and the upgrade path
  (`TokenStorage` is an injected interface, swapping in `expo-secure-store`/Keychain storage
  later doesn't touch call sites).
