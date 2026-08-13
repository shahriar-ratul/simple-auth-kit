# `registry/` — layout convention

This is the source the CLI copies into consumer projects. Nothing here is ever installed as a
dependency.

Every combo ships in **two variants**, chosen by the consumer at `easy-auth add` time:

| Variant | CLI | What it is |
|---|---|---|
| `base` | `easy-auth add <combo>` (default) | Roles and permissions are global to the deployment. `User.roles[]`, `Role.name` unique, direct grants on the user. |
| `workspaces` | `easy-auth add <combo> --workspaces` | A user belongs to any number of workspaces and holds different roles in each. `Workspace` + `WorkspaceMember`, `User` has **no** roles, `Role` unique per `[workspaceId, name]`, direct grants on the *membership*. Workspace-scoped requests carry `X-Workspace-Id`. |

The emitted project contains exactly one variant. A consumer cannot tell the other exists.

## `kind`: this doc covers `api` combos specifically

Every combo also has a `kind` (`api`, `admin`, or `mobile`, in `cli/registry.json` — absent means
`api`, since every combo predating that field is one) and an `installMode` (`merge` or
`scaffold`). This file is entirely about **`kind: "api"`** combos — `registry/combos/*`, `merge`
mode, a source fragment the CLI composes into an *existing* project's `src/lib/auth`. Everything
above (the byte-identical rule, the two-variant model, `shared/`+`variants/*`, the seeder,
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
    │   ├── prisma.config.ts   (Prisma combos only)
    │   └── src/**
    ├── variants/
    │   ├── base/              ← COPIED FOR `add <combo>`
    │   │   ├── .env.example
    │   │   ├── prisma/schema.prisma
    │   │   ├── prisma/migrations/**
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
CLI (`cli/lib/copy.ts`) and `scripts/materialize.mjs` do exactly this, so what the combo
typechecks and proves is what the CLI emits.

### Which files ended up where, in the reference combo

`shared/src`: `auth.config.ts`, `auth.controller.ts`, `auth.guard.ts`, `permission.guard.ts`,
`auth-core-error.filter.ts`, `request-context.ts`, `key-provider.ts`, `rate-limit.store.ts`,
`session.repository.ts`, `two-factor.repository.ts`, `password-reset.repository.ts`,
`oauth.repository.ts`, `dto/auth.dto.ts`.

`variants/<variant>/src`: `auth.module.ts`, `auth.service.ts`, `admin.controller.ts`,
`authz.guard.ts`, `rbac.repository.ts`, `rbac.defaults.ts`, `audit-log.repository.ts`, `seed.ts`,
`dto/admin.dto.ts` — plus, in `workspaces` only, `workspace.controller.ts`,
`workspace.repository.ts`, `dto/workspace.dto.ts`.

`rbac.defaults.ts` is per variant rather than shared because the catalogs differ by one key
(`members:manage` exists only where there are members to manage), and a file must not branch on
its variant. See "Enforcement" below — it is the file the whole authorization story hangs off.

`variants/<variant>/.env.example`: not shared. The workspace variant's seeder reads one variable
the base variant has no concept of (`SEED_WORKSPACE_NAME`), and an emitted project must not
document a variable it will never read — that is the same "a consumer cannot tell the other
variant exists" rule the byte-identical test enforces everywhere else.

### The seam that keeps the shared half shared

Authentication and authorization are separate request-scoped objects (`shared/src/request-context.ts`):

- `req.auth` — the verified access-token claims. Set by the shared `AuthGuard`. Identity only.
- `req.authz` — the roles and permissions that apply to *this request*. Set by `AuthzGuard`,
  which is the one guard each variant writes for itself:
  - `base` reads them straight off the token (resolved once, at issue time — no query).
  - `workspaces` reads the `X-Workspace-Id` header and resolves the membership on the
    `[userId, workspaceId]` unique index, then that membership's roles and permissions.

`PermissionGuard` only ever reads `req.authz`, which is why it is shared. Because the workspace
variant's tokens carry no roles, its `AuthzContext` also carries `workspaceId`/`memberId`, and its
admin service methods take that context — that is what scopes every admin query to one workspace,
and it is also why the permission check is workspace-scoped without a second check: `req.authz`
was resolved from *that* membership, so there is nothing else it could be checking against.

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
variant-agnostic and speaks HTTP only — **do not branch on the variant name in it**. The three
things that genuinely differ come from `variants/<variant>/test/variant-hooks.ts`, which
implements the `VariantHooks` contract in `test/harness.ts`:

- `makeAdmin` — give a user administrative authority, and say how to make admin calls as them.
- `admitUser` — bring a user into that admin's scope (a no-op in `base`).
- `proveVariantProperties` — the assertions only that variant can make. For `workspaces` this
  is the security property the model rests on: **a role held in workspace A grants nothing in
  workspace B.** That test is not optional.

`test/harness.ts` also exports `adminRouteProbes()`: the ten `/auth/admin/*` routes paired with
the permission each is gated on, in an order that undoes itself (assign before revoke, block
before unblock) so the whole list can be run repeatedly against one target user. `prove-cycle.ts`
runs it once per catalog permission, against a caller holding that one permission and a role that
carries nothing, and asserts the routes it names succeed and every other route 403s. Mirroring a
combo means porting that table, not re-deriving it.

## The seeder

Roles are system-defined with fixed permission sets, so a freshly migrated database has no
`Permission` rows and no `Role` rows and authorization has nothing to check against. Every combo
ships `variants/<variant>/src/seed.ts` to close that gap. It is **consumer-facing source**, not
repo tooling: it is copied into the emitted project like any other file under `src/`, and the
consumer runs it as `npm run seed`.

It is one file per variant, never in `shared/` — the two differ in what they seed (workspace
creation, and roles-on-the-user vs roles-on-the-membership), and a file must not branch on its
variant. `scripts/seed.mjs` runs the same file against this combo's own dev database, so what is
exercised here is exactly what a consumer runs.

**The contract every combo's seeder implements.** Mirroring it to another combo is a translation
of these rules into that combo's ORM, not a redesign:

1. **Idempotent by construction.** Every write is an upsert keyed on the natural unique key
   (`Permission.key`, `Role.name` / `[workspaceId, name]`, the `RolePermission` composite id,
   `User.email`, `[userId, workspaceId]`). Nothing is ever deleted, so a re-run is additive: a
   permission attached to a seeded role by hand survives it.
2. **The permission catalog is derived from the routes that exist**, one `noun:verb` key per
   capability the admin API actually exposes — not a speculative list. Reading and writing the
   same noun are separate keys; block/unblock share one, being one capability in two directions.
   `users:read`, `users:block`, `roles:manage`, `roles:assign`, `permissions:grant`,
   `audit-log:read`, plus `members:manage` in the workspace variant only.
3. **Two default roles.** `admin` carries the whole catalog; `member` is the signup/new-membership
   default and carries the empty set, because every key in the catalog is administrative. The
   names are *not* load-bearing for authorization — no guard checks for the string `"admin"` any
   more (see "Enforcement"). They are load-bearing only as the default a new user or membership is
   given: `User.roles` / `WorkspaceMember.roles` default to `["member"]`, and a workspace creator
   gets `["admin", "member"]`, so renaming a role here without renaming it there leaves people
   holding a name with no `Role` row behind it — which resolves to no permissions at all.
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

The seeder does not own the catalog or the role definitions — `rbac.defaults.ts` does, and the
seeder is one of its callers. See "Enforcement" below for why that matters and who the other
callers are.

## Enforcement

`@RequirePermission` on the route is the authorization boundary. There is **no role-based
bypass** anywhere in a combo: a role that carries no permissions confers no authority, whatever
it is called. `AdminGuard` — the old `req.authz.roles.includes("admin")` check — is gone from
`nestjs-prisma` entirely; once every admin route names its permission it was dead code, and
leaving it in would have meant a user with a direct grant and no admin role still got a 403,
which is the opposite of what the permission model says.

### The mapping

Every route under `/auth/admin` in both variants:

| permission | routes |
|---|---|
| `users:read` | `GET /auth/admin/users` |
| `users:block` | `POST .../users/:userId/block`, `POST .../users/:userId/unblock` |
| `roles:manage` | `POST /auth/admin/roles`, `POST /auth/admin/roles/:roleId/permissions` |
| `roles:assign` | `POST .../users/:userId/roles`, `POST .../users/:userId/roles/:roleName/revoke` |
| `permissions:grant` | `POST .../users/:userId/permissions`, `POST .../users/:userId/permissions/:permissionKey/revoke` |
| `audit-log:read` | `GET /auth/admin/audit-log` |

The `workspaces` variant adds, on `WorkspaceController`:

| permission | routes |
|---|---|
| `members:manage` | `POST /workspaces/members`, `DELETE /workspaces/members/:memberId` |
| `roles:assign` | `PUT /workspaces/members/:memberId/roles` |

`PUT /workspaces/members/:memberId/roles` deliberately shares `roles:assign` with the admin route
rather than minting a key of its own: it is the same capability reached by a different path, and
two keys for one capability is how a catalog starts lying about what it grants.

**Three routes are deliberately not gated, and the catalog mints no keys for them.**
`POST /workspaces` and `GET /workspaces` act *outside* every workspace — any authenticated user
may create one or list their own, and gating them on a permission granted inside some other
workspace would mean your first workspace could only be created by someone who already had one.
`GET /workspaces/members` is gated on membership itself, which `WorkspaceGuard` has already
proved; seeing who else is in a room you are in is not an administrative capability.

### `rbac.defaults.ts` — the one definition, and what mirrors it

`variants/<variant>/src/rbac.defaults.ts` is the single source of truth, and every other piece
reads it rather than keeping a copy:

- **`PERMISSION_CATALOG`** — `noun:verb` key → what it grants, one entry per capability the admin
  API actually exposes. Declared `as const satisfies Record<string, string>` so the keys survive
  as a type.
- **`PermissionKey`** = `keyof typeof PERMISSION_CATALOG`, and `RequirePermission` in
  `shared/src/permission.guard.ts` takes **that type, not `string`**. A route cannot demand a
  permission the catalog does not define, so "this route requires something nothing can ever
  grant" is a compile error rather than a 403 nobody can explain. Adding an admin route means
  adding its key to the catalog first — which is exactly the seeder rule ("the catalog is derived
  from the routes that exist") made mechanical.
- **`DEFAULT_ROLES`** — `admin` carries the whole catalog, `member` carries nothing.
- **`provisionDefaultRoles(db[, workspaceId])`** — writes both into a database. `db` is typed
  structurally (`Pick<PrismaClient, "permission" | "role" | "rolePermission">`) so it accepts
  either the client or a `$transaction` client. Every insert is `skipDuplicates`
  (`ON CONFLICT DO NOTHING`) on the natural unique key, so it is idempotent *and* safe to run
  concurrently, and nothing is ever deleted.

Its callers: `src/seed.ts` (both variants), `src/workspace.repository.ts` (workspaces only), and
`variants/base/test/variant-hooks.ts`. The seeder is a *caller* of this definition, not its owner
— which is what makes it impossible for what gets seeded and what the routes demand to drift.

`PermissionGuard` is fail-closed in both directions: no `req.authz`, or the permission absent from
it, is a 403; and the guard applied to a handler that declares no `@RequirePermission` throws
rather than waving the request through. Putting it in a controller-level `@UseGuards` therefore
makes `@RequirePermission` mandatory for every handler on that controller, which is what stops a
newly added admin route from shipping ungated by omission. That is why it is listed in
`@UseGuards` on `AdminController` as a whole, but per route on `WorkspaceController`, where three
routes are ungated on purpose.

### The lockout trap, and how it is closed

In the workspaces variant `Role` is unique per `[workspaceId, name]`, so **a newly created
workspace has no `Role` rows at all**. `POST /workspaces` makes its creator an
`["admin", "member"]` member, but with no `Role`/`RolePermission` rows in that workspace those are
two names with nothing behind them, resolving to zero permissions. The moment routes enforce
permissions, the creator is locked out of the workspace they just made — permanently, since every
route that could fix it is one of the gated ones. The seeder does not help: it only provisions the
workspace *it* creates.

`WorkspaceRepository.create` therefore calls `provisionDefaultRoles(tx, workspace.id)` **inside
the same transaction** that creates the workspace and the creator's membership, so a workspace
never exists without the roles that make it administrable. `prove-cycle` proves it end to end:
create a brand-new workspace, then exercise all thirteen administrative capabilities inside it as
the person who created it. Remove the provisioning call and that section fails immediately — as
does most of the rest of the workspaces run, since the proof's own admin gets their authority from
a workspace they create.

The base variant has no equivalent trap: roles are global, so the seeder is the only bootstrap and
the only failure mode is "run the seeder", already spelled out in the CLI's postInstall notes
(*"Nothing is authorized until it has run at least once"*).

### Two sharp edges worth knowing about

**`base` resolves permissions at token-issue time.** That is what makes the check free (no query
on the hot path), but it means a grant or a revocation lands on the caller's *next token*, not
their next request — the window is bounded by the access-token TTL, and `POST /auth/logout`'s
denylist is the instant kill. `variants/base/test/variant-hooks.ts` asserts this in both
directions rather than leaving it as a comment. The workspaces variant resolves per request, so
revocation there is immediate; it asserts that too.

**Nothing stops an admin revoking their own last role.**
`POST /auth/admin/users/:userId/roles/:roleName/revoke` has no self-check, unlike
`POST .../users/:userId/block` ("cannot block your own account") and
`PUT /workspaces/members/:memberId/roles` ("cannot change your own roles"). In `base` that is
recoverable — re-run the seeder. In `workspaces` it is **not**: an admin who revokes their own
`admin` role in a workspace leaves that workspace with no administrator and no route back in. This
predates enforcement and is unchanged here, but enforcement is what makes it bite. The fix, if
taken, is one line in `AdminController.revokeRole` matching the two guards above — do it in all
four combos at once or not at all.

## Adding a combo (or migrating one)

This section is for `kind: "api"` combos specifically — see `registry/admin-apps/README.md` or
`registry/mobile-apps/README.md` if you're adding an admin console or mobile app instead; those
follow the same byte-identical shared/variant rule but skip most of the steps below (no seeder, no
`@RequirePermission` enforcement table, no `prove-cycle` — a `scaffold`-mode combo is verified by
generating it and running its own build/typecheck, not this file's proof harness).

1. Split the existing flat `src/` into `shared/src` and `variants/base/src` by the byte-identical
   rule above.
2. Write `variants/workspaces/` against the reference combo's schema and endpoint shapes.
3. Copy `scripts/*.mjs` from `nestjs-prisma` — they are combo-agnostic apart from the Prisma/
   Drizzle migration command in `migrate.mjs`.
4. Port `variants/<variant>/src/rbac.defaults.ts` first — the catalog, `PermissionKey`,
   `DEFAULT_ROLES` and `provisionDefaultRoles` — then `variants/<variant>/src/seed.ts` and the
   `SEED_*` block of each variant's `.env.example`, following the contract in "The seeder" above.
   Translating `provisionDefaultRoles` into that combo's ORM is the only real work; keep it
   idempotent, transaction-client-friendly, and `ON CONFLICT DO NOTHING`.
5. Put `@RequirePermission` on every admin route per the table in "Enforcement", delete the
   combo's `AdminGuard`/`requireAdmin` middleware, and — in the workspace variant — provision the
   default roles inside the workspace-creation transaction. A combo that seeds a catalog it does
   not enforce is worse than one that does neither: the admin console hides UI the server would
   have allowed anyway.
6. Add `sharedDir`, `variantsDir` and `variants: ["base", "workspaces"]` to the combo's entry in
   `cli/registry.json`, plus the `npm run seed` line in its `postInstall` notes — the CLI never
   edits a consumer's `package.json`, so the script has to be spelled out for them, and the path
   it points at is `<installPath>/src/seed.ts`, i.e. `tsx src/lib/auth/src/seed.ts` by default
   (a combo's `src/**` lands under the install directory's own `src/`, not directly in it).
7. `npm run typecheck && npm run prove-cycle` must pass for both variants, and `npm run seed`
   must be safe to run twice against the same database.
