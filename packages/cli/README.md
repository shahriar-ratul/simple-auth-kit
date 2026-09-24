# @simple-auth-kit/cli

The CLI for [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — a
shadcn/ui-style auth library. It copies source (backend combos, admin consoles, mobile apps)
into your own project; nothing is ever installed as a runtime dependency of your app.

## Install

Nothing to install — use it directly with `npx`:

```bash
npx @simple-auth-kit/cli add nestjs-prisma --into .
```

Package: https://www.npmjs.com/package/@simple-auth-kit/cli

## Commands

```bash
npx @simple-auth-kit/cli                              # don't know which combo yet? asks: kind, then framework, then variant
npx @simple-auth-kit/cli add <combo> [--workspaces]   # already know? install it directly
npx @simple-auth-kit/cli update [--check]             # re-installs whatever you installed last — no args needed
npx @simple-auth-kit/cli diff                         # shows the actual content diff for every file that differs from the registry (api combos only)
npx @simple-auth-kit/cli --help                       # full command/flag reference + available combos
```

`init` and bare `add` do the same guided walkthrough as running the CLI with no arguments at all;
`init` additionally writes `.simple-auth-kit.json` (install path, alias) first.

`--into <path>` targets any directory (defaults to the current one). In a real terminal,
without `--force` or `--check`, a file that's changed locally since install prompts you —
per file — before it's overwritten; outside a TTY (CI/scripts) it's left alone by default and
reported at the end, same as `--force` always applying and `--check` never writing anything.

**Dependencies are installed for you**, shadcn-`add`-style — no separate `npm install` step, and
version-pinned to match what each combo is actually built and tested against (not just bare
package names left to resolve to "latest"). The package manager is auto-detected from a lockfile
already in the target directory; with no lockfile to go on (a brand new directory, most
commonly) a real terminal is asked which one to use. Override either with
`--pm <npm|pnpm|yarn|bun>`, or skip the install entirely with `--skip-install` if you'd rather
review `package.json` first.

## Available combos

Add `--workspaces` to any of these for the workspaces variant.

**`api`** — merged into `src` of an existing project by default (configurable via
`--path`/`--alias`; the Prisma/Drizzle config + `database/` land at the project root
regardless — see below):

```bash
npx @simple-auth-kit/cli add nestjs-prisma --into .
npx @simple-auth-kit/cli add nestjs-drizzle --into .
npx @simple-auth-kit/cli add express-prisma --into .
npx @simple-auth-kit/cli add express-drizzle --into .
```

**`admin`** — a whole new standalone app, scaffolded at the target (refuses a non-empty target
unless `--force`):

```bash
npx @simple-auth-kit/cli add admin-nextjs --into ./admin
npx @simple-auth-kit/cli add admin-react --into ./admin
```

**`mobile`** — a whole new standalone app, scaffolded at the target (same non-empty-target
rule):

```bash
npx @simple-auth-kit/cli add mobile-expo --into ./mobile
npx @simple-auth-kit/cli add mobile-bare-rn --into ./mobile
```

## Your own database models are safe

The Prisma combos install `prisma.config.ts` + `database/` at your project root, using Prisma's
own multi-file schema support: the CLI's own models live in
`database/schema/simple-auth-kit/`, split by domain (`schema.prisma` for the generator and
datasource, then `user`, `rbac`, `auth`, `audit-log`, and `workspace` in the workspaces variant), and
Prisma merges every `.prisma` file under `database/schema/`. Add your own models in a file directly
under `database/schema/` (e.g. `database/schema/app.prisma`) — the CLI only ever tracks its own
files, so `update` never touches yours, `--force` included. `database/` also holds `migrations/`, `seed.ts` + `seedData/` (seed-only data the app never
imports — edit or delete it freely), and
the generated Prisma client (`database/generated/prisma/`), all reachable from your own source
via the `"@/database/*": ["./database/*"]` tsconfig alias the CLI asks you to add.

The Drizzle combos work the same way at a smaller scale: `drizzle.config.ts`'s `schema` field
is `[schema.ts, *.schema.ts]`, both under `database/` — add your own tables in a sibling
`*.schema.ts` file (e.g. `billing.schema.ts`, next to the CLI-managed `database/schema.ts`) and
`drizzle-kit` picks it up automatically, with no edits to `drizzle.config.ts` itself.

## Clone the source

This is a **standalone copy**, published from the monorepo, with the registry it installs
from bundled in. To pull just this package's source without cloning the whole repo:

```bash
npx degit shahriar-ratul/simple-auth-kit/packages/cli cli
```

(Note: unlike a plain `npm install`, this clone won't have `registry/` bundled in — that
folder is generated fresh from the monorepo's own `registry/` right before every publish. Run
against the monorepo checkout instead if you need the registry alongside the CLI source — see
Development below.)

## Development

Run directly against this monorepo's own `registry/` (no publish/bundle step needed — see
`simple-auth-kit.ts`'s `REGISTRY_ROOT` resolution):

```bash
cd packages/cli
npm run typecheck
npx tsx simple-auth-kit.ts add <combo> --into ../../examples/<app>
```

`npm run prepack` (or a real `npm publish`/`npm pack`) bundles a fresh copy of the repo's
`registry/` into `registry/` here first — that's what makes the published package
self-contained. See `scripts/bundle-registry.mjs`.

## Source

Full source, every backend combo, and every consuming app:
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).
