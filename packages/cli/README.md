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
npx @simple-auth-kit/cli init                       # fresh setup: guided "what do you need" picker
npx @simple-auth-kit/cli add <combo> [--workspaces]  # install a specific combo
npx @simple-auth-kit/cli add                         # guided picker, same flow as init (no config write)
npx @simple-auth-kit/cli update [--check]             # re-installs whatever add last recorded — no args needed
npx @simple-auth-kit/cli                              # full command/flag reference + available combos
```

`--into <path>` targets any directory (defaults to the current one). In a real terminal,
without `--force` or `--check`, a file that's changed locally since install prompts you —
per file — before it's overwritten; outside a TTY (CI/scripts) it's left alone by default and
reported at the end, same as `--force` always applying and `--check` never writing anything.

## Available combos

| Kind | Combo | Installs as |
|---|---|---|
| `api` | `nestjs-prisma`, `nestjs-drizzle`, `express-prisma`, `express-drizzle` | merged into `src/lib/auth` of an existing project (the Prisma/Drizzle config + schema land at the project root instead — see below) |
| `admin` | `admin-nextjs`, `admin-react` | a whole new standalone app, scaffolded at the target (refuses a non-empty target unless `--force`) |
| `mobile` | `mobile-expo`, `mobile-bare-rn` | a whole new standalone app, scaffolded at the target (same non-empty-target rule) |

Add `--workspaces` to any `api`/`admin`/`mobile` combo for the workspaces variant.

## Your own database models are safe

The Prisma combos install `prisma.config.ts` + `prisma/` at your project root, using Prisma's
own multi-file schema support: the CLI's own models live in
`prisma/schema/simple-auth-kit.prisma`, and Prisma automatically merges every other `.prisma`
file you add alongside it. Add your own models in a sibling file (e.g.
`prisma/schema/app.prisma`) — the CLI only ever tracks its own file by exact name, so `update`
never touches yours, `--force` included.

The Drizzle combos work the same way at a smaller scale: `drizzle.config.ts`'s `schema` field
is `[schema.ts, *.schema.ts]` — add your own tables in a sibling `*.schema.ts` file (e.g.
`billing.schema.ts`, next to the CLI-managed `schema.ts`) and `drizzle-kit` picks it up
automatically, with no edits to `drizzle.config.ts` itself.

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
