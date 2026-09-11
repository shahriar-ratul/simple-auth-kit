# Repository Guidelines

`CLAUDE.md` is a symlink to `AGENTS.md` — one file, shared across agents. Edit `AGENTS.md`.

## Project Overview

**simple-auth-kit** is a shadcn-style auth library: source of truth lives in `registry/`, and a CLI
(`simple-auth-kit add <combo>`) *copies* it into a consumer's repo. Nothing is ever installed as an
npm dependency — zero `@simple-auth-kit/*` trace in a consumer's `package.json`. Three kinds of
installable product — `api` backend combos (merge into an existing project), `admin` consoles,
`mobile` apps (scaffold a whole new app) — each shipped in a **base** and a **workspaces**
variant chosen at install time, never at runtime. The rest of the repo is a reference deployment
that proves the claims: 4 backend combos × 2 variants = 8 runnable example backends, 4 admin
consoles, 4 mobile apps, a shared typed API client, and a dev portal.

Read `plan/brief.md` (28-decision architectural log, "the law") before any architectural change.
`docs/README.md` indexes the narrative docs (`architecture.md`, `cli.md`, `backend-api.md`,
`admin-console.md`, `development.md`, `getting-started.md`). `registry/README.md` is the layout
convention for everything under `registry/`.

## Architecture & Data Flow

**Layering (bottom to top), composed identically by the CLI and by each combo's own tooling:**

1. `registry/core/*.ts` — pure TS, zero framework/ORM imports (only `jose`, `argon2`,
   `node:crypto`). Exports plain async functions (`createSession`, `rotateRefreshToken`,
   `signAccessToken`, `completeOAuthLogin`, `verifyTotpCode`, `resolvePermissions`, …) that take a
   small purpose-scoped `*Deps` interface as their first argument (`SessionStoreDeps`,
   `OAuthStoreDeps`, `RateLimitDeps`, …) — **never one unified `AuthStore` interface**
   (`plan/brief.md` decision 1 rejects that shape as "the leaky lowest-common-denominator
   abstraction that made Lucia unmaintainable").
2. `registry/combos/<combo>/shared/src/` — framework-flavored but variant-agnostic: the
   authn/authz seam, response envelope, error mapping, repositories that *structurally* implement
   core's `*Deps` interfaces (e.g. `SessionRepository implements SessionStoreDeps`).
3. `registry/combos/<combo>/variants/{base,workspaces}/src/` — everything whose shape depends on
   how authorization is scoped: `AuthzGuard`'s concrete resolution, `RbacRepository`,
   `rbac.defaults.ts` (permission catalog), `seed.ts`, admin routes, the composition root
   (`auth.module.ts` / `create-auth-app.ts`).

**The rule for where a file goes** (`registry/README.md`, verbatim): *"write both variants, then
hoist every file that comes out byte-identical into `shared/`. Anything that differs — even by
one line — stays in both `variants/*` directories. There is no third category and no conditional
code: a file must not branch on which variant it is in."* Composition = `shared/` copied first,
then `variants/<variant>/` copied over it — done identically by `cli/lib/copy.ts` (real installs)
and each combo's `scripts/materialize.mjs` (dev/typecheck/prove-cycle), so what a combo proves is
exactly what the CLI emits.

**The authn/authz seam** (`shared/src/request-context.ts` declares `req.auth` / `req.authz` /
`req.ability` on the framework's request type):
- `AuthGuard` (shared) — authentication only. Verifies the Bearer token via core's
  `verifyAccessToken`, sets `req.auth`. Never touches `req.authz`/`req.ability`.
- `AuthzGuard` (variant-specific) — resolves `req.authz = {roles, permissions}` from the
  database (`base`: by `userId`; `workspaces`: by `(userId, X-Workspace-Id)` membership, also
  sets `workspaceId`/`memberId`), behind `PermissionCache` (version-key invalidation,
  single-flight on miss, negative results never cached; Redis-swappable via a DI token, in-memory
  by default). Then builds `req.ability` from the flat CASL slugs.
- `AbilityGuard` (shared) — reads `@CheckAbility` metadata and enforces `req.ability`; only reads,
  never resolves.
- **CASL flat-slug pattern**: the permission slug *is* the CASL action, subject is the empty
  string — `can("users:read", "")`. No subject taxonomy, no conditions
  (`shared/src/ability.ts`).
- **Three route tiers**, and a route declaring none of them **fails at boot**, naming itself:
  `@Public()` (no auth), authenticated-only, `@CheckAbility(...)` (admin surface). NestJS combos
  enforce this via a Reflector-based walk (`route-tiers.ts`'s
  `assertEveryRouteDeclaresATier`, called before any DB/port is allocated); Express combos enforce
  it structurally — `createTieredRouter(...).route(method, path, tier, ...handlers)` is the only
  way to register a route, and TypeScript hides `.get`/`.post` on the returned handler.
- Response envelope everywhere: `{success, statusCode, message, data}` (success) /
  `{success:false, statusCode, code, message}` (error) — NestJS via `ResponseInterceptor` +
  a global `@Catch()` filter, Express via a `res.json` monkey-patch + a single `HttpError` class.

**Framework idiom mapping** — same seam, different vocabulary: NestJS combos use
classes+decorators+DI (`@Injectable`, `CanActivate` guards, `Reflector`); Express combos use
factory functions returning closures (`createAuthMiddleware`, `createTieredRouter`), with
`ability(...slugs)` throwing at router-registration time if a slug isn't in
`PERMISSION_CATALOG` (a compile/register-time analogue of Nest's boot check, not the identical
mechanism).

**CLI composition & distribution**: `cli/simple-auth-kit.ts` is fully `cli/registry.json`-driven (no
hardcoded combo logic). `cli/lib/copy.ts` computes a sha256 per destination-relative path; a file
is left alone (reported as skipped) whenever its on-disk hash no longer matches the last-recorded
manifest — i.e. user-edited — unless `--force`. `auth.lock.json` in the consumer's `targetRoot`
persists `{combo, variant, installedAt, files: {path: sha256}}` so re-installs/variant switches
prune stale files cleanly.

**Client layer**: `packages/auth-client`'s `AuthClient` class is the one HTTP layer for every
consumer app. `TokenStorage {get,set,clear}` is the single injected interface — "the only thing
that differs between the 4 apps" (`packages/auth-client/src/types.ts`). `request()` and
`scopedRequest()` have different signatures — only `scopedRequest()` can pass a workspace ID, so
omitting the `X-Workspace-Id` header on a non-scoped call is structural, not a discipline.
`authedRequest` does exactly one refresh-then-retry on a 401. `rawFetch` is the single point that
unwraps the envelope and maps non-2xx to `AuthApiError`.

**App layer**: `apps/admin-nextjs`/`admin-react` use **MobX** (`makeAutoObservable`);
`apps/mobile-expo`/`mobile-bare-rn` use **Zustand** — a deliberate per-platform split, not drift
to unify. Both build a local CASL `Ability` client-side from the flat permission-slug list
returned by `GET /auth/me`, mirroring `ability.ts`'s server-side pattern.

## Key Directories

| Path | Purpose |
|---|---|
| `registry/core/` | Framework/ORM-free auth logic: sessions, JWTs, 2FA, OAuth, password reset, RBAC union. |
| `registry/combos/{nestjs-prisma,nestjs-drizzle,express-prisma,express-drizzle}/` | Backend combos; each has `shared/`, `variants/{base,workspaces}/`, `test/`, `scripts/`, `.variant/` (gitignored build output). `nestjs-prisma` is the reference. |
| `registry/admin-apps/{nextjs,react}/`, `registry/mobile-apps/{expo,bare-rn}/` | Scaffold-mode source templates for the 4 client apps; no `prove-cycle` equivalent (verified by generate+typecheck+build only). |
| `cli/` | `simple-auth-kit.ts` entrypoint, `lib/copy.ts` (manifest-driven copy/prune), `registry.json` (the manifest: core/variants/combos, install mode, post-install steps). |
| `packages/auth-client/` | One `AuthClient` class shared by all 4 consumer apps; consumed from its compiled `dist/`. |
| `apps/` | The 8 runnable client apps (`admin-{nextjs,react}[-workspaces]`, `mobile-{expo,bare-rn}[-workspaces]`) + `dev-portal` (host-run control panel). Mirrors `registry/{admin,mobile}-apps/*` 1:1. |
| `examples/` | 8 CLI-materialized backend snapshots (`<combo>-app[-workspaces]`), **not** part of the pnpm workspace — plain npm, models a real consumer. |
| `docs/` | Narrative deep-dives: architecture, CLI, backend API, admin console, dev loop, getting started. |
| `plan/` | `brief.md` (decision log — architectural law) and `plan.md` (a single closed/executed implementation plan; not a live backlog). |

## Development Commands

```bash
# Root (requires Postgres at localhost:55432, passwordless `postgres` superuser)
docker run -d --name simple-auth-kit-postgres -p 55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
pnpm install
pnpm -r typecheck                 # == make typecheck; pnpm -r --if-present run typecheck
pnpm -r test                      # vitest: registry/core (56), packages/auth-client (36) — see Testing & QA
pnpm portal                       # dev portal -> http://127.0.0.1:8080
docker compose up --build         # postgres + 8 backends + 4 consoles (make help for all Makefile targets)
```

```bash
# Single test file / test name (both suites are plain vitest, no config file anywhere)
cd registry/core && npx vitest run test/rbac.test.ts
npx vitest run test/rbac.test.ts -t "dedupes a permission"
cd packages/auth-client && npx vitest run -t "refresh"
```

```bash
# Combo dev loop — the real gates (registry/combos/<combo>/)
npm run typecheck                            # materializes both variants (+ `prisma generate` for Prisma combos), tsc each
npm run prove-cycle                          # black-box HTTP proof, both variants — the actual merge gate
npm run prove-cycle workspaces               # one variant only
npm run migrate -- base --name <name>        # author a migration; writes back into variants/<v>/{prisma,drizzle}
npm run seed -- base                         # idempotent; SEED_ADMIN_EMAIL/PASSWORD to add an admin
npm run materialize -- base                  # compose .variant/base without compiling
```

```bash
# Example backend (what you actually run)
cd examples/nestjs-prisma-app
(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)   # drizzle combos: npx drizzle-kit migrate
npm run seed && npm run start                # -> :3001, Swagger /docs, Scalar /reference
```

```bash
# CLI, in-repo; also how examples/ get re-synced after a registry/core or combo change
cd cli && npx tsx simple-auth-kit.ts add <combo> [--workspaces] --force --into ../examples/<app>
```

Apps: `npm run dev` in `apps/admin-*`/`apps/mobile-expo*` (`typecheck`; Next.js apps also declare
`build`/`lint`, see **Runtime/Tooling Preferences** for the `lint` caveat). `npm run start` /
`ios` / `android` in `apps/mobile-*`. `npm run build` on a console is the real merge gate — it
prerenders every page and catches what dev mode tolerates.

Ports: backends `3001`–`3008` (base then workspaces, in `nestjs-prisma, nestjs-drizzle,
express-prisma, express-drizzle` order); `admin-nextjs` `3000`/`3010`; `admin-react`
`5173`/`5174`; `dev-portal` `8080`. Full table + env vars: root `README.md`,
`docs/getting-started.md`.

## Code Conventions & Common Patterns

- **Dependency injection is plain function parameters, not interfaces/classes.** Core exports
  take a small `*Deps` object as their first argument; combo repositories satisfy those types
  structurally (duck typing), never via a shared base class. Follow this shape for any new core
  function — do not introduce a unified store interface.
- **Flat permission slugs**: `PermissionSlug = keyof typeof PERMISSION_CATALOG`
  (`variants/<v>/src/rbac.defaults.ts`) — a route can only name a slug the catalog defines; the
  compiler enforces it. New permission → add to the catalog first.
- **Error handling**: `registry/core/types.ts` defines `AuthCoreError` + 6 typed subclasses (each
  with a fixed `code` string). Combos map these centrally — one `@Catch()` filter in NestJS
  combos, one `next(err)`-driven middleware in Express combos — so handlers never format error
  JSON by hand. Internal/unexpected errors always collapse to a bare `500` with no leaked detail.
- **DTOs are Swagger-documentation-only**, not the runtime-validated type — do not add
  `class-validator` decorators expecting them to run. Runtime body validation is hand-rolled via
  local `requireString()`/`optionalString()` helpers reading `Record<string, unknown>` (a
  documented workaround: `esbuild`/`tsx` don't reliably emit decorator type metadata).
- **Route registration always declares a tier.** NestJS: `@Public()` / `@Authenticated()` /
  `@CheckAbility(...)` on every controller method — omission fails the app at boot. Express:
  `router.route(method, path, tier, ...handlers)` where `tier` is a required positional argument.
  Never add a route without one of these.
- **Self-lockout guards are inlined at the call site**, not a generic policy layer — e.g.
  `if (userId === req.auth!.sub) throw new ForbiddenException(...)` on self-delete/self-role-revoke/
  self-block. Only operations that could strand a deployment without an admin are refused;
  self-assigning a role is fine.
- **State management differs by platform, deliberately**: MobX in the Next.js/React admin
  consoles, Zustand in the mobile apps. Don't infer one app's pattern from the other.
- **Async style** is plain `async`/`await` throughout core, combos, and the client — no
  callback/observable-based core logic (NestJS's `rxjs` dependency is framework plumbing, not a
  core pattern to imitate).
- **Combos are hand-maintained per file, not generated from one template** — semantically
  identical logic (e.g. `ability.ts`) differs in wording/comments across combos. The
  byte-identical rule applies *within* one combo's `base` vs `workspaces`, never *across* combos.
- **Operational secrets vs. config** (`docker-compose.yml`, per repo policy): credentials
  (`AUTH_SECRET`, `AUTH_JWT_SECRET_*`) are sourced only via `${VAR:?set VAR in .env}`, never a
  literal; topology fully determined by the compose file itself (ports, service DNS names,
  derived URLs) is hardcoded directly — don't route a fixed value through an env var nobody will
  ever override.

## Important Files

- `plan/brief.md` — architectural decision log (the law); `plan/plan.md` — closed 2026-08-12
  parity-build plan, all 6 phases done; treat `docs/development.md`'s "known gaps" section as more
  current than `brief.md`'s older "what is left" list where the two overlap.
- `registry/README.md` — the layout convention (byte-identical hoisting rule, seeder contract,
  lockout-trap explanation, "adding a combo" recipe).
- `registry/core/types.ts` — every domain type and the `AuthCoreError` hierarchy.
- `registry/combos/nestjs-prisma/shared/src/{request-context.ts,auth.guard.ts,ability.ts,
  ability.guard.ts,route-tiers.ts,permission-cache.ts,response.interceptor.ts,
  auth-core-error.filter.ts}` — the reference implementation of the authn/authz seam; read these
  first to understand the pattern before touching any other combo.
- `registry/combos/nestjs-prisma/variants/{base,workspaces}/src/{authz.guard.ts,rbac.defaults.ts,
  seed.ts,auth.module.ts}` — variant-specific resolution, the permission catalog, the seeder, and
  the composition root (`AuthModule.forRoot` runs the boot-time tier check before any DB/port
  allocation).
- `cli/simple-auth-kit.ts`, `cli/lib/copy.ts`, `cli/registry.json` — CLI entrypoint, manifest-driven
  copy/prune, and the manifest schema (`core`, `variants`, `combos{dir, sharedDir, variantsDir,
  variants[], peerDependencies[], postInstall[], kind?, installMode?}`; `kind`/`installMode`
  default to `"api"`/`"merge"` by omission — only the 4 admin/mobile combos declare them
  explicitly as `"scaffold"`).
- `packages/auth-client/src/auth-client.ts`, `types.ts` — the one HTTP client and its
  `TokenStorage` seam.
- `docker-compose.yml`, `.env.example` — service topology and the secret-slot list (kept 1:1).
- `Makefile` — thin wrappers only (`install`, `up`/`up-build`/`down`/`down-v`, `build`, `restart`,
  `logs`, `ps`, `portal`, `typecheck`, `test`, `clean`); no lint/format target exists.
- `docs/development.md` — the add-a-domain recipe (model → repository → DTO → service/routes →
  permission slugs → provider registration → `prove-cycle` → `auth-client` methods → console
  pages); read before adding any new resource to a combo.

## Runtime/Tooling Preferences

- **Package manager: pnpm workspaces** — `pnpm-workspace.yaml` covers `registry/core`,
  `registry/combos/*`, `cli`, `packages/*`, `apps/*`. `examples/*` is **intentionally excluded**
  (plain npm, models a real external consumer with its own lockfile).
- **No enforced Node/pnpm version.** No root `engines`/`packageManager` field; README/docs state
  Node v26+/pnpm v11+ as prose only. The sole `engines` field in the repo is
  `apps/mobile-bare-rn[-workspaces]`'s `"node": ">= 22.11.0"` — lower than the stated baseline and
  only covers 2 of ~19 workspace packages.
- **TypeScript**: `tsconfig.base.json` (ES2022, NodeNext, strict, `experimentalDecorators` for
  NestJS) is extended only by the Node-side packages (`cli`, `registry/core`,
  `registry/combos/*`, `packages/auth-client`, and the `materialize.mjs`-generated
  `.variant/*/tsconfig.json`). Every framework app (Next.js, Vite, Expo, bare RN) uses its own
  framework-provided base config with a `@/*` → `./src/*` alias and does **not** inherit from the
  root — don't assume a root compiler-option change reaches app code.
- **`packages/auth-client` is consumed from `dist/`.** After changing it:
  `npm run typecheck && npm test && npm run build`. If an app can't see a new method, it's a
  stale `dist/` or a cached `tsconfig.tsbuildinfo` (delete it).
- **No repo-wide linter/formatter.** Only `apps/mobile-bare-rn[-workspaces]` has a real toolchain
  (`.eslintrc.js` extends `@react-native`, classic ESLint 8 config + Prettier 2.8.8, sourced from
  `registry/mobile-apps/bare-rn/shared/`). A `biome-ignore-all` comment survives in 5 copies of one
  shadcn-generated `multi-selector.tsx` — harmless, Biome isn't installed anywhere.
  **Known gap**: `apps/admin-nextjs[-workspaces]` declare `"lint": "next lint"` with no `eslint`
  dependency or config anywhere in the app — don't rely on that script; it isn't wired up.
- **Combo dev loops need Postgres at `localhost:55432`** directly (passwordless `postgres`
  superuser), independent of the `docker-compose.yml` network — `prove-cycle`/`migrate`/`seed`
  scripts all assume this fixed local port, not the compose-internal `postgres` hostname.
- **Examples add dependencies by hand.** The CLI copies source, not deps: `argon2`/`jose` (core's
  peer deps) are added directly to each `examples/*/package.json`, since the combo package.json
  itself only lists framework/ORM deps.

## Testing & QA

Three tiers, **no CI configured anywhere** (no `.github/workflows`, no other `*.yml` besides
`docker-compose.yml`) — every gate below is a manually-run local discipline.

1. **Unit (Vitest, no config file, pure defaults)**:
   - `registry/core/test/*.test.ts` — 56 tests / 8 files, one per source module (crypto, oauth,
     password-reset, rate-limit, rbac, session-policy, token-service, two-factor). Convention:
     `describe("<module>")`, flat `it("<plain-English behavior>")`; fakes implement the same
     `*Deps` interface production code takes.
   - `packages/auth-client/test/auth-client.test.ts` — 36 tests, 1 file (identity, refresh-on-401,
     workspace-header contract, admin surface). Mocks global `fetch`; a data-driven sweep over
     every client method catches `X-Workspace-Id` header leaks.
   - Run: `pnpm -r test` from root (`pnpm -r --if-present run test`).
2. **Black-box integration (`prove-cycle`, backend combos only)** — the real merge gate for
   `registry/combos/*`. `registry/combos/nestjs-prisma/test/prove-cycle.ts` is ~129 shared
   `assert()` calls (fail-closed boot check, signup/login/session lifecycle, refresh
   rotation+reuse-detection, block/deactivate toggles, 2FA, password reset, RBAC CRUD, audit log,
   a full permission-enforcement matrix with front/back CASL-ability equivalence) plus
   variant-specific hooks (`variants/base/test/variant-hooks.ts` ~16 asserts,
   `variants/workspaces/test/variant-hooks.ts` ~62 asserts incl. explicit cross-workspace
   isolation) — **~145 assertions for `base`, ~191 for `workspaces`**, matching the "300+ across
   both variants" figure in `docs/development.md`. All 4 combos share this structure near-verbatim
   (verified express-prisma/express-drizzle/nestjs-drizzle). Run via
   `node scripts/prove-cycle.mjs [variant...]` (`npm run prove-cycle`) — materializes, migrates,
   seeds (a proof *dependency*, not a convenience — without a default role the first assertion
   fails), then executes against real Postgres. **Not wired into `pnpm -r test`.**
   - **Caveat**: each combo's own `package.json` `"test"` script is
     `vitest run --passWithNoTests` — a no-op decoy (no `*.test.ts` files exist under
     `registry/combos/**`). `pnpm -r test` therefore gives false confidence about backend
     coverage; always run `prove-cycle` explicitly to validate combo changes.
3. **Typecheck/build-only gates (everything client-facing)** — `apps/admin-*`,
   `apps/mobile-expo*`, `apps/dev-portal`, `cli`, and the `registry/{admin,mobile}-apps` templates
   they're generated from have no automated behavioral tests. Verification is a documented manual
   production build + real browser/device walkthrough (per repo policy: "console = production
   build + a real browser walkthrough"). `apps/mobile-bare-rn[-workspaces]` is the one app with a
   `test` script (`jest`), but it's the stock React Native CLI template smoke test — asserts
   nothing about auth.

No coverage thresholds are configured anywhere. Before landing a combo change: run that combo's
`npm run typecheck` and `npm run prove-cycle` (both variants) — this is the actual gate, not
`pnpm -r test`.
