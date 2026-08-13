# Development workflows

The loops you'll actually run, plus the gotchas that cost time if you don't know them.

## Working on a combo (library source)

The reference combo is `registry/combos/nestjs-prisma`. Its sources are split into `shared/`
(both variants) and `variants/{base,workspaces}/`; the CLI and the local tooling **materialize**
them into `.variant/` (gitignored) before anything compiles:

```bash
cd registry/combos/nestjs-prisma
npm run typecheck      # materializes both variants + prisma generate + tsc on each
npm run prove-cycle    # black-box proof: boots a temp instance, 300+ assertions across both variants
npm run migrate -- base --name <migration_name>   # prisma migrate against auth_reference (localhost:55432)
npm run seed -- base   # idempotent; SEED_ADMIN_EMAIL/PASSWORD env to also create an admin
```

Edit files in `variants/<variant>/src/` or `shared/src/` — **never** in `.variant/` (it's
regenerated). If a change touches `shared/`, check both variants still typecheck; shared files
must stay inert for the variant that doesn't use them.

`prove-cycle` needs Postgres at `localhost:55432`. It is the merge gate for combo changes: it
boots the real module, runs the full auth/RBAC flow, and asserts fail-closed behavior (e.g. an
untiered route must crash the boot; a deactivated permission must 403 immediately).

## Syncing an example after combo changes

Examples are CLI snapshots, not symlinks. After changing a combo:

```bash
cd cli && npx tsx easy-auth.ts add nestjs-prisma --force --into ../examples/nestjs-prisma-app
cd ../examples/nestjs-prisma-app
(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
```

`--force` overwrites even user-modified files — fine for the in-repo examples, which hold no
hand edits inside the managed `src/lib/auth/` dir. Without `--force`, modified files are
skipped (that's the consumer-facing update behavior). New backend dependencies (e.g. socket.io,
throttler) must be added to the example's own `package.json` — the CLI copies source, not deps.

Then rebuild the docker image if you run via compose: `docker compose build nestjs-prisma-app`.

## The auth-client rebuild gotcha

`packages/auth-client` is consumed from **`dist/`**, not raw TS. After changing it:

```bash
cd packages/auth-client
npm run typecheck && npm test && npm run build   # build emits dist/ — the part people forget
```

If an app's typecheck can't see a method you just added, it's one of two staleness layers:
`dist/` wasn't rebuilt, or the app's `tsconfig.tsbuildinfo` cached the old types — delete it
(`rm apps/admin-nextjs/tsconfig.tsbuildinfo`) and re-run.

## Adding a new backend domain end-to-end (the recipe)

The countries/languages/customers modules all followed this shape; `country.*` is the cleanest
template. Nine steps, repository → UI:

1. **Prisma model** in `variants/base/prisma/schema.prisma` — copy the standard column set from
   an existing model (id/uuid, `isActive`, `createdBy`/`updatedBy`, soft-delete columns,
   timestamps). Then `npm run migrate -- base --name add_<domain>`.
2. **Repository** `variants/base/src/<domain>.repository.ts` — list (search/page/limit/
   `activeOnly`), get, create, update, soft-delete, `setActive`. Shape rows through a
   `to<Domain>Summary()` that forwards **every safe column** (BigInt ids → strings, Dates →
   ISO). The list must map rows through it too — returning raw Prisma rows crashes JSON
   serialization on BigInt (a real bug caught in verification).
3. **DTOs** `variants/base/src/dto/<domain>.dto.ts` — Swagger documentation only; controllers
   validate manually, matching the existing convention.
4. **Service methods** in `auth.service.ts`, **routes** in `admin.controller.ts` (GET list/one,
   POST create, PATCH update, DELETE soft-delete, POST `/:id/activate|deactivate`), each with
   `@CheckAbility("<domain>:...")`.
5. **Slugs** in `rbac.defaults.ts` — `<domain>:read`, `:manage`, `:status`. That's all the
   seeder needs; the `admin` role spreads the whole catalog.
6. **Provider registration** in `auth.module.ts`.
7. **prove-cycle**: run it — the startup route-tier check alone will catch an unguarded route.
8. **auth-client**: types (full row) + methods following the `listRoles` pattern
   (`scopedRequest`, `activeOnly` filter) → rebuild `dist/`.
9. **Console pages**: copy the customers page group (list/schema/new/[id]/edit), add the
   sidebar entry + `PERMISSIONS` keys in `src/lib/ability.ts`.

Then sync the example (above) and verify against the running pair.

## Console dev loop

```bash
cd apps/admin-nextjs
pnpm dev          # against whatever backend NEXT_PUBLIC_AUTH_API_URL points at (default :3001)
pnpm typecheck
pnpm build        # the merge gate — prerenders every page, catches what dev mode tolerates
```

## Whole-workspace checks

```bash
pnpm -r typecheck
pnpm -r test        # registry/core (52), auth-client (36)
```

## Verification philosophy

Nothing counts as done on typecheck alone. The pattern used throughout this repo, worth
keeping: **backend** — prove-cycle plus a live cURL pass against a seeded instance;
**console** — production build plus a real-browser walkthrough (login, redirects, each page
rendering live data, one create through a real form, logout). The 2026-08-12 parity build's
walkthrough found two real bugs that typecheck and unit tests missed (BigInt list
serialization; docker-internal URL split — see `AUTH_API_INTERNAL_URL` in getting-started.md).

## Known state / gaps (as of 2026-08-13)

- The **content domains, WS feed, throttling, and NextAuth console flow** live in
  **nestjs-prisma base + admin-nextjs** (the reference pair). The **reference form recipe and
  the user/role profile fields** (dob/gender/joinedDate, role isDefault/isActive) are rolled out
  wider — all 4 admin apps and all 4 combo pairs (see brief.md decision 28).
- Changes land combo-first (`registry/combos/*`, gated by prove-cycle); examples are regenerated
  or back-ported to agree. An example that's ahead of its combo is a bug, not a feature.
- Mobile apps: verified by typecheck/bundling/Metro boot, not by a recent device run;
  `mobile-bare-rn` needs a one-time manual Xcode step for `react-native-config`.
- Docker consoles run `next dev`, not production builds (deliberate — see the Dockerfile note).
