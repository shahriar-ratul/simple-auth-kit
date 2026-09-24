# Architecture

The mental model, from distribution down to a request. The authoritative decision log with full
reasoning is `plan/brief.md` — this doc is the tour; that file is the law.

## Distribution: a registry, not a package

The library is **copied, never installed**. `registry/` holds the source of truth; the CLI
(`packages/cli/simple-auth-kit.ts`) copies it into a consumer repo:

```bash
npx simple-auth-kit add nestjs-prisma               # backend, base variant (the default)
npx simple-auth-kit add nestjs-prisma --workspaces  # backend, workspace-aware variant
npx simple-auth-kit add admin-react --into ./admin  # a whole admin console app
npx simple-auth-kit add                             # guided multi-kind flow (api + admin + mobile)
```

- Zero `@simple-auth-kit/*` in any consumer's `package.json`.
- Updates use a content-hash lockfile (`auth.lock.json`): re-running `add` skips files the
  consumer has modified; `--force` overrides.
- A consumer installs **one** variant and cannot tell the other exists.

## Three kinds, two install modes

Every registry entry has a `kind` and an `installMode` (`packages/cli/registry.json`):

| Kind     | Products                                                                           | Install mode | What the CLI writes                                                                                                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`    | `nestjs-prisma` (reference), `nestjs-drizzle`, `express-prisma`, `express-drizzle` | `merge`      | A source fragment composed into an **existing** project: `registry/core/` + the combo's `shared/` + `variants/<variant>/`, landing under `src/` (configurable) as `common/`, `infra/`, `modules/auth/`, plus `core/`; `database/` (schema/migrations/seed, Prisma's generated client) lands at the project root regardless of `--path`. |
| `admin`  | `admin-nextjs`, `admin-react`                                                      | `scaffold`   | A **whole standalone app** — `package.json`, `src/`, everything — written directly into the target directory.                                                                                                                                                                                                                           |
| `mobile` | `mobile-expo`, `mobile-bare-rn`                                                    | `scaffold`   | Same, plus native-identity retemplating for `mobile-bare-rn` (bundle id / `applicationId` / project names driven by `--name`).                                                                                                                                                                                                          |

All 8 products use the same `shared/` + `variants/{base,workspaces}` composition and the same
rule for deciding where a file goes: **write both variants, then hoist every file that comes
out byte-identical into `shared/`** — anything that differs, even by one line, stays duplicated
in both variants, and no file may branch on which variant it's in. Details and per-kind
specifics: `registry/README.md`, `registry/admin-apps/README.md`, `registry/mobile-apps/README.md`.

## Layers

```
registry/core/            framework/ORM-free auth logic (sessions, JWTs, 2FA, OAuth flows,
                          password reset, RBAC primitives). Storage is injected as function
                          parameters. 56 unit tests.
registry/combos/<combo>/  framework+ORM wiring around core — the 4 api products.
registry/admin-apps/      admin console templates — nextjs/ and react/, each shared+variants.
registry/mobile-apps/     mobile app templates — expo/ and bare-rn/, each shared+variants.
packages/cli/                      the copy tool (init / add / diff) + registry.json manifest.
examples/<combo>-app[-workspaces]/   8 real consumer apps produced BY the CLI — the runnable
                          backends. Snapshots, not symlinks: re-sync after combo changes.
packages/auth-client/     one typed API client used by all 8 client apps (compiled to dist/).
                          36 tests.
apps/                     the reference deployment: 4 admin consoles + 4 mobile apps + the
                          dev-portal. The admin/mobile apps are the source the registry
                          templates were extracted from, and stay the place you run and
                          verify them.
```

**No shared runtime adapter interface across combos** — each combo wires storage idiomatically.
A single `AuthStore` interface all combos implement was rejected explicitly (the
lowest-common-denominator abstraction that made Lucia unmaintainable).

## Variants: base vs. workspaces

Chosen at CLI copy time, not a runtime mode:

- **base** — roles and permissions are global to the deployment.
- **workspaces** — `Workspace` + `WorkspaceMember`; a user belongs to many workspaces with
  different roles in each; roles are scoped per workspace; direct grants attach to a membership.
  The acting workspace is named per request by an `X-Workspace-Id` header — never a token claim.

There is **no multi-tenancy** (removed permanently; true isolation is a separate deployment).

## Authorization

- **CASL** with **flat permission slugs**: the slug is the CASL action, subject is the empty
  string — `can("users:read", "")`. No subject taxonomy, no conditions.
- **Permissions live in the database**, resolved per request (user → roles → role permissions,
  plus direct grants, deduped), cached in memory by `AuthzCache` (`common/auth/cache/`): every authorization write the app makes bumps the single `authz_version` row through the ORM (inside the same transaction when there is one), so API-driven grants and revokes apply on the very next request on every instance; a change written straight to the database applies once the entry's TTL (`authzCache.ttlSeconds`, default 30) runs out. `authzCache.enabled`/`revalidate` turn the cache or the per-request version check off; `authzCache.store` swaps in-memory for e.g. Redis (never a dependency). Real join tables: `RoleUser`,
  `PermissionRole`, `PermissionUser`. A grant or revocation made through the API lands on the
  caller's **next request**, not their next token.
- **Never in the JWT.** The access token carries identity and session only.
- **Only the slug list is code**: `permission-slugs.ts` defines `PERMISSION_SLUGS` (18 slugs in
  the reference combo's base variant, +`members:manage` in workspaces; 9/10 in the other combos,
  which have no content domains) and `PermissionSlug` — `@CheckAbility` takes that type, so a
  route cannot demand a slug the list doesn't define. Everything else (permission names, roles,
  grants) is data in the database; `database/seedData/` is an optional starting point the app
  never imports.
- **Three route tiers, enforced at startup**: `@Public()`, authenticated-only, or
  `@CheckAbility("slug")`. A route carrying none of them fails the boot, naming itself — a new
  route cannot ship open by omission.
- Code declares what a route demands; the database decides who is granted it.

## Sessions and tokens

- Transport is `Authorization: Bearer` — never cookies — as the **backend contract**. Client
  apps cache the token pair on top (`cookies-next` on web, `AsyncStorage` on mobile) via the
  injected `TokenStorage` interface.
- **The database never stores a usable credential**: refresh revocation is a `sessionVersion`
  claim + `currentRefreshJti`, with a denylist for instant access-token revocation. (Deliberate
  divergence from the reference app the console replicates, which stores raw token columns.)
- `auth-client` auto-refreshes: on a 401 it attempts exactly one refresh-token rotation and
  retries the request once; if refresh fails it clears storage and surfaces the original error.

## Where features live (the parity map)

`nestjs-prisma` is the reference combo; `apps/admin-nextjs` is the reference console. Not
everything has been mirrored everywhere, and the docs shouldn't pretend otherwise:

| Feature                                                                              | Where it exists                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth + RBAC + admin surface (users/roles/permissions/audit-log), seeder, prove-cycle | All 4 combos, both variants                                                                                                                                                 |
| Auth-flow rate limiting (login, password reset — `registry/core/rate-limit.ts`)      | All 4 combos, both variants                                                                                                                                                 |
| Role `isDefault`/`isActive`, `isActive` on users/permissions                         | All 4 combos, both variants                                                                                                                                                 |
| Content domains (countries/languages/customers)                                      | `nestjs-prisma` only — both variants (workspace-scoped in `workspaces`)                                                                                                     |
| Realtime audit feed (socket.io `/audit-logs` gateway)                                | `nestjs-prisma` **base only**                                                                                                                                               |
| HTTP throttling (`@nestjs/throttler`, global guard)                                  | `nestjs-prisma` **base only**                                                                                                                                               |
| User profile fields `dob`/`gender`/`joinedDate`                                      | NestJS combos only (both variants); absent from the express combos                                                                                                          |
| Content-domain pages, live-feed UI, full form recipe                                 | All 4 admin consoles                                                                                                                                                        |
| NextAuth v5 + edge `proxy.ts` guard                                                  | `apps/admin-nextjs` only — the other 3 consoles use client-side re-verification on every route change (a deliberate trust-model split, see `registry/admin-apps/README.md`) |

## The admin console pairing (2026-08-12 parity build)

`apps/admin-nextjs` is a literal replica of an external reference admin panel
(`ai-invoice-app/admin` — pages, components, interaction patterns, auth library), and the
nestjs-prisma base backend carries the API surface of a second reference (`namaz-app/api`),
minus its Quran content domain and its second self-service auth stack. Decisions 24–27 in
`plan/brief.md` govern this: NextAuth v5 adopted directly as the session orchestrator (a thin
wrapper — the backend Bearer contract is unchanged), `@simple-auth-kit/auth-client` stays the only
HTTP layer (no axios), and flat-list dropdowns use `?activeOnly=true` on the normal list
endpoints rather than parallel `/common/all-*` controllers.

Domain naming note: this library's RBAC `User` corresponds to the reference's `Admin` (staff
with roles); the reference's end-user entity is here called **`Customer`** — admin-managed CRUD
only, no login capability, no roles.

## The reference deployment proves the claims

- `registry/core` — 56 unit tests (crypto, OAuth, password reset, rate limit, RBAC, session
  policy, tokens, 2FA).
- Each combo — `prove-cycle`: boots a temporary instance and black-box-tests the full flow
  (signup, login, 2FA, RBAC enforcement, OAuth-shaped flows, password reset, audit log,
  authz cache hits, API revokes on the next request and direct-DB revokes after the TTL; cross-workspace isolation on the workspaces variant). 300+ assertions across
  both variants in the reference combo.
- `packages/auth-client` — 36 tests (mocked fetch).
- `apps/dev-portal` — replays every combo's migrations into a throwaway database and diffs the
  resulting schemas, so the ER diagram and the drift table cannot disagree with the migrations.
