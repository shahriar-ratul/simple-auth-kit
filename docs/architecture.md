# Architecture

The mental model, from distribution down to a request. The authoritative decision log with full
reasoning is `plan/brief.md` — this doc is the tour; that file is the law.

## Distribution: a registry, not a package

The library is **copied, never installed**. `registry/` holds the source of truth; the CLI
(`cli/easy-auth.ts`) copies it into a consumer repo:

```bash
npx easy-auth add nestjs-prisma               # base variant (the default)
npx easy-auth add nestjs-prisma --workspaces  # workspace-aware variant
```

- Zero `@easy-auth/*` in any consumer's `package.json`.
- Updates use a content-hash lockfile (`auth.lock.json`): re-running `add` skips files the
  consumer has modified; `--force` overrides.
- A consumer installs **one** variant and cannot tell the other exists.

## Layers

```
registry/core/            framework/ORM-free auth logic (sessions, JWTs, 2FA, OAuth flows,
                          password reset, RBAC). Storage is injected as function parameters.
registry/combos/<combo>/  framework+ORM wiring around core — nestjs-prisma (reference),
  shared/                 nestjs-drizzle, express-prisma, express-drizzle. Each combo:
  variants/base/          - shared/: files common to both variants
  variants/workspaces/    - variants/: per-variant sources, composed at materialize time
  .variant/               - .variant/: gitignored materialized output (shared + variant merged)
cli/                      the copy tool (add / init / diff)
examples/<combo>-app[-workspaces]/   8 real consumer apps produced BY the CLI — the runnable
                          backends. Snapshots, not symlinks: re-sync after combo changes.
packages/auth-client/     one typed API client used by all 8 client apps (compiled to dist/)
apps/                     4 admin consoles + 4 mobile apps + the dev-portal
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
  plus direct grants, deduped) behind an injected cache with version-key invalidation and
  single-flight. Real join tables: `RoleUser`, `PermissionRole`, `PermissionUser`.
- **Never in the JWT.** The access token carries identity and session only, so a revoked grant
  dies at the next request, not at token expiry.
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
  divergence from the reference app this console replicates, which stores raw token columns.)
- `auth-client` auto-refreshes: on a 401 it attempts exactly one refresh-token rotation and
  retries the request once; if refresh fails it clears storage and surfaces the original error.

## The admin console pairing (2026-08-12 parity build)

`apps/admin-nextjs` is a literal replica of an external reference admin panel
(`ai-invoice-app/admin` — pages, components, interaction patterns, auth library), and the
nestjs-prisma base backend carries the API surface of a second reference (`namaz-app/api`),
minus its Quran content domain and its second self-service auth stack. Decisions 24–27 in
`plan/brief.md` govern this: NextAuth v5 adopted directly as the session orchestrator (a thin
wrapper — the backend Bearer contract is unchanged), `@easy-auth/auth-client` stays the only
HTTP layer (no axios), and flat-list dropdowns use `?activeOnly=true` on the normal list
endpoints rather than parallel `/common/all-*` controllers.

Domain naming note: this library's RBAC `User` corresponds to the reference's `Admin` (staff
with roles); the reference's end-user entity is here called **`Customer`** — admin-managed CRUD
only, no login capability, no roles.

## The reference deployment proves the claims

- `registry/core` — 52 unit tests.
- Each combo — `prove-cycle`: boots a temporary instance and black-box-tests the full flow
  (signup, login, 2FA, RBAC enforcement, OAuth-shaped flows, password reset, audit log,
  cache behavior; cross-workspace isolation on the workspaces variant). 300+ assertions across
  both variants in the reference combo.
- `packages/auth-client` — 36 tests.
- `apps/dev-portal` — replays every combo's migrations into a throwaway database and diffs the
  resulting schemas, so the ER diagram and the drift table cannot disagree with the migrations.
