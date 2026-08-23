# The `easy-auth` CLI

`cli/easy-auth.ts` copies `registry/` source into a target project and records what it wrote
in a lockfile. The product catalog lives in `cli/registry.json`. Distribution model and UX are
deliberately shadcn/ui-shaped: nothing is ever installed as a runtime dependency, and once
linked, usage is a single `easy-auth add <combo>` run from inside your own project — same shape
as `npx shadcn add <component>`.

## Install once, use anywhere

```bash
cd cli && npm link          # once — registers a global `easy-auth` command
```

From then on, in **any** project on the machine:

```bash
cd ~/your-project
easy-auth add nestjs-prisma           # or any other combo, optionally --workspaces
```

No `--into` needed — it already defaults to the current directory, exactly like `cd`-ing into
your project before running an installer. Prefer not to link? The unlinked form works
identically: `npx tsx <path-to-this-repo>/cli/easy-auth.ts add <combo> --into <path>`.

`easy-auth` alone prints the full command/combo reference; `easy-auth add` with no combo name
launches a guided prompt (pick kind, framework, variant) instead of requiring every flag up
front. See `docs/cli-generation-guide.html` for a fully-verified walkthrough of all 16
combo×variant combinations, real terminal output included.

## Commands

| Command | What it does |
|---|---|
| `init` | Writes `.easy-auth.json` in the target (`path`, `alias`, `ignore`) so later `add` runs don't need flags. |
| `add <combo>` | Installs one product (see modes below). |
| `add` (no combo) | Guided multi-kind flow: pick kinds (api/admin/mobile) and a framework per kind via prompts — or drive it entirely with `--kind`/`--framework`. |
| `diff` | **Stub** — prints "not implemented yet" plus the file list from `auth.lock.json`. |

## Flags

| Flag | Meaning |
|---|---|
| `--workspaces` | Install the workspaces variant (default is base). `--variant <base\|workspaces>` is the explicit form. |
| `--into <path>` | Target project root (defaults to cwd). |
| `--path <dir>` | Where the api fragment lands inside the target (default `src/lib/auth`). |
| `--alias <alias>` | Import alias rewritten into the copied sources (default `@/lib/auth`). |
| `--name <appName>` | Scaffold installs: templates `package.json` name/description, and drives `mobile-bare-rn`'s native identity renaming. Falls back to the target directory's basename. |
| `--kind api,admin,mobile` | Multi-kind flow: which kinds to generate (comma list). |
| `--framework <name>,...` | Multi-kind flow: framework per kind, positionally matched to `--kind`. |
| `--force` | Overwrite files the consumer has locally modified (normally they're skipped and reported). |

## Install modes

**`merge`** (the 4 `api` combos): composes `registry/core/` → `<into>/<path>/core`, then the
combo's `shared/`, then `variants/<variant>/` over the top, rewriting the `@/lib/auth/core`
import alias to the consumer's. The consumer's project keeps its own `package.json` — the CLI
prints the combo's peer dependencies and post-install notes (including the `npm run seed`
line) instead of editing it.

**`scaffold`** (the 2 `admin` + 2 `mobile` combos): writes `shared/` + `variants/<variant>/`
**directly into the target directory** as a complete standalone app — `package.json`,
`src/`, configs, everything — then templates the package name from `--name`. For
`mobile-bare-rn` it additionally runs `cli/lib/rename-native.ts`: Android package folder
move, iOS project/scheme/source renames, and a string sweep across `android/`/`ios/` +
`app.json`, so every generated app gets a unique bundle id / `applicationId`
(see `registry/mobile-apps/README.md` for the mechanics).

## The lockfile

Both modes write `auth.lock.json`: combo, variant, install time, and a sha256 manifest of
every file written. On a re-run:

- Files whose on-disk hash still matches the manifest are updated freely.
- Files the consumer modified are **skipped** and listed (`--force` overwrites them).
- Files from the previous install that aren't in the new manifest are pruned.

For `mobile-bare-rn`, the native renamer also rewrites the manifest paths to follow every
file/directory rename, so a later re-sync doesn't see the whole native tree as
spuriously-removed-and-modified.

## Multi-kind generation and namespacing

When one `add` run installs **more than one** product (e.g. `--kind api,admin`), each install
goes into its own subdirectory of the target root — `<targetRoot>/<comboName>/` (e.g.
`./nestjs-prisma/`, `./admin-react/`). Two scaffold installs into one directory would collide
outright, and each one's prune step would delete the other's files. With a single selection
the install lands directly in the target root, as before. When namespaced, a given `--name`
is suffixed per combo (`<name>-<comboName>`) so sibling apps don't collide on package name.

## Known limitation: `@easy-auth/auth-client`

The scaffolded admin/mobile apps declare `"@easy-auth/auth-client": "workspace:*"`, which only
resolves inside this monorepo's pnpm workspace — the package is private and unpublished. A
scaffolded app generated **outside** the monorepo won't install until that dependency is
resolved by hand. Each combo's post-install notes call it out; publishing the package is a
separate, deliberately-unmade decision.

## Keeping the in-repo examples in sync

`examples/*` are themselves CLI output. After changing a combo:

```bash
cd cli && npx tsx easy-auth.ts add <combo> [--workspaces] --force --into ../examples/<app>
```

`--force` is fine there — the examples hold no hand edits inside the managed `src/lib/auth/`
directory. Read the CLI's own `skipped`/`keptModified` output: anything listed is a real
hand-edit the force-copy preserved and worth reviewing. New backend dependencies must be added
to the example's own `package.json` — the CLI copies source, not deps.
