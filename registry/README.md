# `registry/` — layout convention

This is the source the CLI copies into consumer projects. Nothing here is ever installed as a
dependency.

Every combo ships in **two variants**, chosen by the consumer at `simple-auth-kit add` time:

| Variant      | CLI                                        | What it is                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`       | `simple-auth-kit add <combo>` (default)    | Roles and permissions are global to the deployment. Real join tables (`RoleUser`, `PermissionRole`, `PermissionUser`); direct grants attach to the user.                                                                                                                                                              |
| `workspaces` | `simple-auth-kit add <combo> --workspaces` | A user belongs to any number of workspaces and holds different roles in each. `Workspace` + `WorkspaceMember`; `Role` unique per `[workspaceId, slug]`; membership-scoped join tables (`RoleMember`, `PermissionMember`); direct grants attach to the _membership_. Workspace-scoped requests carry `X-Workspace-Id`. |

The emitted project contains exactly one variant. A consumer cannot tell the other exists.

## `kind`: this doc covers `api` combos specifically

Every combo also has a `kind` (`api`, `admin`, or `mobile`, in `packages/cli/registry.json` — absent means
`api`, since every combo predating that field is one) and an `installMode` (`merge` or
`scaffold`). This file is entirely about **`kind: "api"`** combos — `registry/combos/*`, `merge`
mode, a source fragment the CLI composes into an _existing_ project's `src/lib/auth`. Everything
here (the byte-identical rule, the two-variant model, `shared/`+`variants/*`, the seeder,
enforcement) is specific to that shape.

`kind: "admin"` (`registry/admin-apps/*`) and `kind: "mobile"` (`registry/mobile-apps/*`) combos
share the same `shared/`+`variants/{base,workspaces}` composition and the same byte-identical
hoisting rule, but `installMode: "scaffold"`: the CLI writes a **whole standalone app** — its own
`package.json`, its own `src/`, everything — directly into the target directory, not a fragment
merged into a host project. See `registry/admin-apps/README.md` and
`registry/mobile-apps/README.md` for what's specific to those two.

## Directory layout

`registry/combos/nestjs-prisma` is the reference. Every other combo mirrors this shape exactly.

```
registry/
├── core/                      variant-agnostic auth logic. Knows nothing about workspaces,
│                              and must stay that way — it receives already-resolved roles and
│                              permissions; resolving them is the combo's job.
└── combos/<combo>/
    ├── package.json           scripts below; never copied to consumers
    ├── tsconfig.json          editor/tooling only; never copied
    ├── .env                   local dev only (base variant's DATABASE_URL); never copied
    ├── scripts/
    │   ├── materialize.mjs    composes .variant/<variant>/ from shared/ + variants/<variant>/
    │   ├── migrate.mjs        authors a migration for a variant, copies it back into variants/
    │   ├── prove-cycle.mjs    runs the black-box proof against each variant
    │   └── seed.mjs           runs a variant's seeder against this combo's dev database
    ├── shared/                ← COPIED FOR BOTH VARIANTS
    │   ├── .gitignore
    │   ├── prisma.config.ts   (Prisma combos only) / drizzle.config.ts (Drizzle combos only)
    │   ├── root/**            lands at the consumer's PROJECT root, not under src/ —
    │   │                      tsconfig/oxlint/husky wiring, docker-compose.yml, and
    │   │                      monitoring/ (Grafana + Prometheus + node_exporter, in both
    │   │                      docker compose and Kubernetes form)
    │   └── src/**
    ├── variants/
    │   ├── base/              ← COPIED FOR `add <combo>`
    │   │   ├── .env.example
    │   │   ├── database/schema/**  (Prisma: .prisma files) or database/schema.ts (Drizzle)
    │   │   ├── database/migrations/**
    │   │   ├── database/seed.ts
    │   │   ├── database/seedData/**  seed data only — never imported by src/
    │   │   ├── root/**        project-root files that differ per variant, copied over
    │   │                      shared/root/ — e.g. monitoring/prometheus/prometheus.yml,
    │   │                      whose scrape target is this variant's own app port
    │   │   ├── src/**
    │   │   └── test/variant-hooks.ts
    │   └── workspaces/        ← COPIED FOR `add <combo> --workspaces`
    │       └── (same shape)
    ├── test/                  shared proof harness; never copied to consumers
    │   ├── bootstrap.ts
    │   ├── harness.ts
    │   └── prove-cycle.ts
    └── .variant/              gitignored build output — a composed, runnable variant
```

**The rule for deciding where a file goes: write both variants, then hoist every file that comes
out byte-identical into `shared/`.** Anything that differs — even by one line — stays in both
`variants/*` directories. There is no third category and no conditional code: a file must not
branch on which variant it is in.

Composition is `shared/` copied first, then `variants/<variant>/` copied over the top. Both the
CLI (`packages/cli/lib/copy.ts`) and `scripts/materialize.mjs` do exactly this, so what the combo
typechecks and proves is what the CLI emits.

### Inside `src/`: `common/`, `infra/`, `modules/`

Every combo's `src/` (shared + variant, overlaid) groups into three top-level folders, plus
whatever `registry/core/*` is mounted as (always `core/`, at the project root the CLI installs
into — see below for why nothing here is also named `core/`):

- **`common/`** — cross-cutting auth infrastructure used by every feature module: `common/auth/`
  (the ability model, permission cache, rate-limit store, the plain authentication guard/middleware,
  and each variant's own authorization guard/middleware), `common/config/` (generic — `auth.config`,
  `key-provider`, and for Drizzle combos the DB connection factory — not auth-namespaced, since a
  consumer might reasonably add unrelated config here too), `common/helpers/`.
- **`infra/`** — framework-wide, non-auth-specific plumbing: the response envelope/interceptor,
  the error/exception filter, `request-context`, `route-tiers`, the hand-authored or
  decorator-derived OpenAPI wiring. Named `infra/`, deliberately **not** `core/` — the CLI always
  copies `registry/core/*` (the framework-free pure logic layer: crypto, oauth, session-policy,
  token-service, rbac union, …) to `<installDir>/core` regardless of `--path`, so a same-named
  grouping inside the combo's own source would collide with it in a real install.
- **`modules/`** — one subfolder per feature module, each with its own routes/controllers, DTOs,
  services, and repositories: `modules/auth/` (identity/session: signup, login, refresh, 2FA,
  password reset, `/api/v1/auth/me`, self-profile update — plus, on the workspaces variant,
  workspace membership itself), `modules/admin/` (user CRUD, block/unblock/deactivate/activate,
  the user-scoped role/permission _assignment_ endpoints, and — nestjs-prisma only — the
  countries/languages/customers content domains), `modules/roles/` (role catalog CRUD),
  `modules/permissions/` (permission catalog CRUD), `modules/audit-log/` (audit log listing).
  Each controller/router declares its own route as `v1/<module-name>` — `v1/admin`, `v1/roles`,
  `v1/permissions`, `v1/audit-log` — since that part of the path is intrinsic to the route. `api`
  is a separate, deployment-level concern layered on top (`app.setGlobalPrefix("api", {...})` in
  a NestJS consumer's own `main.ts`, or baked into `createAuthApp()`'s router mounts for the
  Express combos), giving the full `/api/v1/<module-name>` path a client actually calls — see
  `docs/backend-api.md`.

**`RbacRepository` is not split** across `modules/roles/`/`modules/permissions/` even though
their controllers live in separate modules — it is the one class every request's authorization
resolution goes through (`resolveAuthzContext`, cache invalidation, default-role assignment at
signup), and physically fragmenting it was judged too high a correctness risk for the
organizational benefit. Every module that needs it (via the NestJS combos' `CoreAuthModule`, or a
constructor/factory argument in the Express combos) shares the same instance.

**NestJS combos only**: `common/auth/core-auth.module.ts` is a `@Global()` module centralizing
`AUTH_CONFIG`, the DB client, `KeyProviderService`, `PermissionCache`, the rate-limit store,
`RbacRepository`, and the three guards — exported so every feature module can inject them without
redeclaring providers. Its `forRoot(config)` is the _only_ remaining dynamic-module config surface;
everything that used to ship inside the old monolithic `AuthModule.forRoot()` — the global
exception filter, the response-envelope interceptor, `ThrottlerModule` + its guard — is now
assembled by the consumer in their own `app.module.ts` (see
`examples/nestjs-prisma-app/src/app.module.ts`). `modules/auth/auth.module.ts` itself is a plain,
non-global `@Module` with no `forRoot()` — "just a simple module," not the app's integration
surface. **Express combos** have no DI container forcing this kind of ambient registration in the
first place — `createAuthApp()` stays the single, linear wiring function it always was; only the
router/module split applies there.

### Which files ended up where, in the reference combo

`shared/src`: the identity/session/2FA machinery and everything both variants use unchanged —
`common/config/auth.config.ts`, `modules/auth/controllers/auth.controller.ts`,
`common/auth/guards/auth.guard.ts`, `common/auth/ability/{ability.ts,ability.guard.ts}`,
`infra/route-tiers.ts`, `common/auth/cache/permission-cache.ts`, `infra/request-context.ts`,
`infra/interceptor/response.interceptor.ts`, `common/helpers/{pagination.ts,id.helper.ts}`,
`common/config/key-provider.ts`, `common/auth/cache/rate-limit.store.ts`,
`infra/filters/auth-core-error.filter.ts`, the `session/two-factor/password-reset/oauth`
repositories (`modules/auth/repositories/`), `modules/auth/dto/auth.dto.ts`.

`variants/<variant>/src`: everything whose implementation depends on how authorization is
scoped — `modules/auth/auth.module.ts`, `modules/auth/services/auth.service.ts`,
`modules/admin/controllers/admin.controller.ts`, `common/auth/guards/authz.guard.ts`,
`modules/auth/repositories/rbac.repository.ts`, `modules/auth/permission-slugs.ts`,
`modules/audit-log/repositories/audit-log.repository.ts`, `database/seed.ts`, `database/seedData/**`,
`modules/admin/dto/admin.dto.ts`, and the content-domain repositories
(`modules/admin/repositories/{country,language,customer}.repository.ts`, this combo only). Plus,
in `base` only, `modules/auth/gateways/audit-log.gateway.ts` (the socket.io feed) and
`infra/openapi/docs.ts`; in `workspaces` only, `modules/auth/controllers/workspace.controller.ts`,
`modules/auth/repositories/workspace.repository.ts`, `modules/auth/dto/workspace.dto.ts`.

`permission-slugs.ts` and `database/seedData/` are per variant rather than shared because the
slug lists differ by one (`members:manage` exists only where there are members to manage), and a
file must not branch on its variant. See "Enforcement" below.

`variants/<variant>/.env.example`: not shared. The workspace variant's seeder reads one variable
the base variant has no concept of (`SEED_WORKSPACE_NAME`), and an emitted project must not
document a variable it will never read — that is the same "a consumer cannot tell the other
variant exists" rule the byte-identical test enforces everywhere else.

### The seam that keeps the shared half shared

Authentication and authorization are separate request-scoped objects (`shared/src/infra/request-context.ts`):

- `req.auth` — the verified access-token claims. Set by the shared `AuthGuard`. Identity only —
  **nothing about authorization is ever in the token.**
- `req.authz` — the roles and permissions that apply to _this request_, resolved from the
  database. Set by `AuthzGuard`, which is the one guard each variant writes for itself:
  - `base` resolves the caller's global roles/permissions on the `userId`.
  - `workspaces` reads the `X-Workspace-Id` header, resolves the membership on the
    `[userId, workspaceId]` unique index, then that membership's roles and permissions — its
    `AuthzContext` also carries `workspaceId`/`memberId`, which is what scopes every admin
    query to one workspace without a second check.

Both variants resolve through `PermissionCache` (version-key invalidation, single-flight), so
the steady-state cost is a cache read while the semantics stay "read from the database": a
grant or revocation lands on the caller's **next request**, not their next token, and
`POST /auth/logout`'s denylist is the instant kill for a live access token.

`AuthzGuard` also builds `req.ability` — the CASL ability over the resolved permission slugs —
which is what the shared `AbilityGuard` checks. `AbilityGuard` only ever reads what the
variant's `AuthzGuard` resolved, which is why it can be shared.

## Working on a combo

```bash
cd registry/combos/<combo>
npm run materialize -- workspaces   # compose one variant into .variant/workspaces
npm run prisma:generate             # compose both + generate their Prisma clients
npm run typecheck                   # both variants
npm run prove-cycle                 # both variants, end to end, against Postgres
npm run migrate -- workspaces --name init   # author migrations, written back into variants/
npm run seed -- workspaces          # run that variant's seeder against its dev database
```

Each variant owns its own database (`auth_reference`, `auth_reference_workspaces`) — their
schemas are different shapes, not different states of one schema.

Migrations are **regenerated clean per variant**, never amended with drop-column migrations:
the CLI copies the migration directory verbatim into every consumer's repo, so a migration that
exists only to undo a decision this library already reversed is permanent archaeology in
someone else's project.

## The proof

`npm run prove-cycle` runs `test/prove-cycle.ts` against each materialized variant. That file is
variant-agnostic and speaks HTTP only — **do not branch on the variant name in it**. The things
that genuinely differ come from `variants/<variant>/test/variant-hooks.ts`, which implements
the `VariantHooks` contract in `test/harness.ts`:

- `makeAdmin` — give a user administrative authority, and say how to make admin calls as them.
- `admitUser` — bring a user into that admin's scope (a no-op in `base`).
- `proveVariantProperties` — the assertions only that variant can make. For `workspaces` this
  is the security property the model rests on: **a role held in workspace A grants nothing in
  workspace B.** That test is not optional.

`test/harness.ts` also exports `adminRouteProbes()`: admin routes paired with the permission
slug each is gated on, in an order that undoes itself (assign before revoke, block before
unblock) so the whole list can be run repeatedly against one target user. `prove-cycle.ts` runs
it once per catalog slug, against a caller holding that one permission and a role that carries
nothing, and asserts the routes it names succeed and every other route 403s. Mirroring a combo
means porting that table, not re-deriving it.

## The seeder

Roles and the permission catalog are seeded data, so a freshly migrated database has no
`Permission` rows and no `Role` rows and authorization has nothing to check against. Every combo
ships `variants/<variant>/src/seed.ts` to close that gap. It is **consumer-facing source**, not
repo tooling: it is copied into the emitted project like any other file under `src/`, and the
consumer runs it as `npm run seed`. `scripts/seed.mjs` runs the same file against this combo's
own dev database, so what is exercised here is exactly what a consumer runs.

**The contract every combo's seeder implements.** Mirroring it to another combo is a translation
of these rules into that combo's ORM, not a redesign:

1. **Idempotent by construction.** Every write is an upsert keyed on the natural unique key
   (`Permission.slug`, `Role.slug` / `[workspaceId, slug]`, the join-table composite ids,
   `User.email`, `[userId, workspaceId]`). Nothing is ever deleted, so a re-run is additive: a
   permission attached to a seeded role by hand survives it.
2. **The seed data lives in `database/seedData/`** (`permissions.ts`, `roles.ts`, `provision.ts`,
   plus `workspace.ts` in the workspaces variant): one permission row per slug in
   `permission-slugs.ts` (see "Enforcement"), not a speculative list.
3. **Two default roles.** `admin` carries the whole catalog; `member` is the signup/new-membership
   default and carries the empty set, because every slug in the catalog is administrative. No
   guard checks for a role name — the names are load-bearing only as the default a new user or
   membership is given, and as `SEED_ADMIN_ROLES` (`["admin", "member"]`, so the admin is also
   an ordinary user).
4. **The initial admin comes from `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`, or not at all.**
   No default and no generated password: with either variable missing the seeder prints why it
   is skipping the admin and exits 0. The password is hashed with core's `hashPassword`, the
   same call signup makes, so the seeded admin can actually log in. An admin who already exists
   keeps their current password — the seeder never rewrites one it did not set.
5. **The workspace variant also seeds the first workspace** (`SEED_WORKSPACE_NAME`, defaulting to
   `"Default workspace"`) and makes the admin an `["admin", "member"]` member of it. The
   workspace and its roles are seeded whether or not credentials were supplied — roles are
   scoped to a workspace in this variant, so without one there is nowhere for them to exist.
   Workspace names are not unique in the schema, so a re-run adopts the workspace it created
   last time by name rather than making a second one.
6. **`DATABASE_URL` and the `SEED_*` variables are read from the environment**, falling back to
   the working directory's `.env` via `process.loadEnvFile()` — which never overrides a variable
   the process was already given. No `dotenv` dependency is added to the consumer's project.

**Seed data is not application code.** Nothing under `src/` imports `database/seedData/` or
`database/seed.ts`: the app builds and runs with both deleted, and after seeding the database is
the only source of truth for which permissions exist, which roles carry them, and who holds
them. The dependency runs one way only — the seed data imports `PermissionSlug` from the app so
it can't miss a slug a route is gated on.

## Enforcement

**Three route tiers, checked at startup.** Every route is exactly one of `@Public()`,
authenticated-only, or `@CheckAbility("<slug>")`; `route-tiers.ts` walks the route table at
boot and a route carrying none of them **crashes the boot, naming itself** — a new admin route
cannot ship open by omission. There is **no role-based bypass** anywhere in a combo: a role
that carries no permissions confers no authority, whatever it is called.

### `permission-slugs.ts` — the one piece of RBAC that is code

`variants/<variant>/src/modules/auth/permission-slugs.ts` lists the slugs this build's routes are
gated on, and nothing else — no display names, no roles, no grants:

- **`PERMISSION_SLUGS`** — one `noun:verb` slug per capability the admin API exposes: in the
  reference combo, 18 in `base`, 19 in `workspaces` (+`members:manage`); 9/10 in the other combos,
  which have no content domains. The route → slug mapping lives in `docs/backend-api.md`.
- **`PermissionSlug`** — the union of those slugs. `@CheckAbility` (Express: `ability(...)`) takes
  **that type, not `string`**, so "this route requires something nothing can ever grant" is a
  compile error rather than a 403 nobody can explain. Express also checks each slug against
  `PERMISSION_SLUGS` at registration. Deployments may mint new slugs at runtime
  (`POST /permissions` accepts any string), but those cannot gate a route this library ships.

Everything else is data. `database/seedData/` holds a starting point — permission display names
and groups, the `admin`/`member` roles, which roles the seeded accounts get — and
`provisionDefaultRoles(db[, workspaceId])` writes it; its only callers are `database/seed.ts` and
the variant hooks in `test/`. Every insert is `ON CONFLICT DO NOTHING` on the natural unique key,
so it is idempotent _and_ safe to run concurrently, and nothing is ever deleted.

Resolution at request time (`AuthzGuard` → `PermissionCache` → `RbacRepository`) unions role
permissions with direct grants and dedupes; `AbilityGuard` then checks the route's slug against
the resulting CASL ability. Fail-closed in both directions: no resolved context, or the slug
absent from it, is a 403.

### Ungated on purpose

Three workspace routes are deliberately not gated, and the catalog mints no slugs for them.
`POST /workspaces` and `GET /workspaces` act _outside_ every workspace — any authenticated user
may create one or list their own, and gating them on a permission granted inside some other
workspace would mean your first workspace could only be created by someone who already had one.
`GET /workspaces/members` is gated on membership itself, which the guard chain has already
proved; seeing who else is in a room you are in is not an administrative capability.

### The lockout trap, and how it is closed

In the workspaces variant `Role` is unique per workspace, so **a newly created workspace has no
`Role` rows at all**. `POST /workspaces` makes its creator an `["admin", "member"]` member, but
with no `Role`/`PermissionRole` rows in that workspace those are two names with nothing behind
them, resolving to zero permissions. The moment routes enforce permissions, the creator is
locked out of the workspace they just made — permanently, since every route that could fix it
is one of the gated ones. The seeder does not help: it only provisions the workspace _it_
creates.

`WorkspaceRepository.create` therefore creates the workspace's roles **inside the same
transaction** that creates the workspace and the creator's membership, so a workspace never
exists without the roles that make it administrable. It builds them from the database, not from
seed data: `admin` carries every slug in `PERMISSION_SLUGS` that exists and is active in the
permission table, and `member` (the new-membership default) carries nothing; the creator holds
both. Permissions a deployment minted at runtime are deliberately left out, so one workspace's
custom permissions never leak into another workspace's admin role. `prove-cycle` proves it end to end:
create a brand-new workspace, then exercise the administrative capabilities inside it as the
person who created it. Remove the role creation and that section fails immediately — as
does most of the rest of the workspaces run, since the proof's own admin gets their authority
from a workspace they create.

The second half of the same trap — an admin removing their own authority — is closed at the
route layer: `cannot change your own roles` (admin roles route and the workspace
member-roles route), `cannot block/deactivate/delete your own account`. Assigning to yourself
is allowed; only the self-directed operations that could strand a deployment or a workspace
without an administrator are refused.

The base variant has no equivalent trap: roles are global, so the seeder is the only bootstrap
and the only failure mode is "run the seeder", already spelled out in the CLI's postInstall
notes (_"Nothing is authorized until it has run at least once"_).

## Adding a combo (or migrating one)

This section is for `kind: "api"` combos specifically — see `registry/admin-apps/README.md` or
`registry/mobile-apps/README.md` if you're adding an admin console or mobile app instead; those
follow the same byte-identical shared/variant rule but skip most of the steps below (no seeder,
no enforcement table, no `prove-cycle` — a `scaffold`-mode combo is verified by generating it
and running its own build/typecheck, not this file's proof harness).

1. Split the existing flat `src/` into `shared/src` and `variants/base/src` by the byte-identical
   rule above.
2. Write `variants/workspaces/` against the reference combo's schema and endpoint shapes.
3. Copy `scripts/*.mjs` from `nestjs-prisma` — they are combo-agnostic apart from the Prisma/
   Drizzle migration command in `migrate.mjs`.
4. Port `variants/<variant>/src/modules/auth/permission-slugs.ts` first, then
   `variants/<variant>/database/seedData/` (permissions, roles, `provisionDefaultRoles`), then
   `database/seed.ts` and the `SEED_*` block of each variant's `root/.env.example`, following the
   contract in "The seeder" above. Translating `provisionDefaultRoles` into that combo's ORM is
   the only real work; keep it idempotent, transaction-client-friendly, and `ON CONFLICT DO
NOTHING`. Nothing under `src/` may import `database/seedData/`.
5. Put `@CheckAbility` on every admin route per the mapping in `docs/backend-api.md`, wire the
   startup route-tier check, and — in the workspace variant — create the new workspace's roles
   from the database inside the workspace-creation transaction. A combo that seeds a catalog it does not enforce
   is worse than one that does neither: the admin console hides UI the server would have
   allowed anyway.
6. Add `sharedDir`, `variantsDir` and `variants: ["base", "workspaces"]` to the combo's entry in
   `packages/cli/registry.json`, plus the `npm run seed` line in its `postInstall` notes — the CLI never
   edits a consumer's `package.json`, so the script has to be spelled out for them, and the path
   it points at is `<installPath>/src/seed.ts`, i.e. `tsx src/lib/auth/src/seed.ts` by default
   (a combo's `src/**` lands under the install directory's own `src/`, not directly in it).
7. `npm run typecheck && npm run prove-cycle` must pass for both variants, and `npm run seed`
   must be safe to run twice against the same database.
