# The `simple-auth-kit` CLI

`packages/cli/simple-auth-kit.ts` copies `registry/` source into a target project and records what it wrote
in a lockfile. The product catalog lives in `packages/cli/registry.json`. Distribution model and UX are
deliberately shadcn/ui-shaped: nothing is ever installed as a runtime dependency, and usage is a
single `add <combo>` run from inside your own project — same shape as `npx shadcn add <component>`.

## From npm (recommended)

Published as [`@simple-auth-kit/cli`](https://www.npmjs.com/package/@simple-auth-kit/cli),
registry bundled in — no separate clone needed:

```bash
cd ~/your-project
npx @simple-auth-kit/cli add nestjs-prisma      # or any other combo, optionally --workspaces
npx @simple-auth-kit/cli update                 # later: re-syncs whatever add installed, no args needed
```

No `--into` needed — it already defaults to the current directory. Not sure which combo you want?
See the Commands table below — running the CLI with no arguments launches a guided picker instead
of requiring every flag up front. See `docs/cli-generation-guide.html` for a fully-verified
walkthrough of all 16 combo×variant combinations, real terminal output included.

## From a monorepo checkout (developing this repo)

```bash
cd packages/cli && npm link          # once — registers a global `simple-auth-kit` command
```

From then on, in **any** project on the machine, `simple-auth-kit add <combo>` works exactly like
the published form above. Prefer not to link? The unlinked form works identically: `npx tsx
<path-to-this-repo>/packages/cli/simple-auth-kit.ts add <combo> --into <path>`.

## Commands

| Command            | What it does                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(no command)_     | In a real terminal: the guided picker — pick kind(s) (api/admin/mobile), a framework per kind, then base or workspaces. Outside a TTY: prints the full command/combo reference instead (same as `--help`).              |
| `init`             | Same guided picker as above, but first writes `.simple-auth-kit.json` in the target (`path`, `alias`, `ignore`) so later installs remember it. `--config-only` writes that file and stops, without installing anything. |
| `add <combo>`      | Skip the picker — install one named product directly (see modes below).                                                                                                                                                 |
| `add` (no combo)   | Same guided picker as bare invocation — this is the form `--kind`/`--framework` drive non-interactively.                                                                                                                |
| `update [--check]` | Re-installs whatever combo+variant `auth.lock.json` already records — no need to name the combo again. `--check` reports what would change without writing anything (merge-mode combos only).                           |
| `diff`             | Shows the actual content diff (unified diff format) for every tracked file that differs from the current registry — whether that's an upstream change or your own edit. Read-only. Merge-mode (api) combos only.        |

## Flags

| Flag                          | Meaning                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--workspaces`                | Install the workspaces variant (default is base). `--variant <base\|workspaces>` is the explicit form.                                                                                                            |
| `--into <path>`               | Target project root (defaults to cwd).                                                                                                                                                                            |
| `--path <dir>`                | Where the api fragment lands inside the target (default `src`).                                                                                                                                                   |
| `--alias <alias>`             | Import alias rewritten into the copied sources (default `@`).                                                                                                                                                     |
| `--name <appName>`            | Scaffold installs: templates `package.json` name/description, and drives `mobile-bare-rn`'s native identity renaming. Falls back to the target directory's basename.                                              |
| `--kind api,admin,mobile`     | Multi-kind flow: which kinds to generate (comma list).                                                                                                                                                            |
| `--framework <name>,...`      | Multi-kind flow: framework per kind, positionally matched to `--kind`.                                                                                                                                            |
| `--force`                     | Overwrite files the consumer has locally modified (normally they're skipped and reported). In a TTY, without `--force`, a locally-modified file triggers a per-file "overwrite?" prompt instead of a silent skip. |
| `--check`                     | `update` only: report what would change without writing anything.                                                                                                                                                 |
| `--skip-install`              | Don't run the package manager after copying files — the default is to install for you (see below).                                                                                                                |
| `--pm <npm\|pnpm\|yarn\|bun>` | Which package manager to install with — default: detected from a lockfile in the target directory, or prompted for in a TTY when neither says anything (npm otherwise).                                           |
| `--config-only`               | `init` only: just write `.simple-auth-kit.json` and stop, no install.                                                                                                                                             |

## Dependencies are installed for you

Like `npx shadcn add`, this CLI runs the install after copying files — it doesn't just print
the command and leave it to you. Skipped entirely under `--skip-install`, and skipped
automatically when nothing actually changed (a no-op `update` has nothing new to install for).
For merge-mode combos this installs the combo's declared peer dependencies, version-pinned to
match what that combo is actually built and proven against (not just bare package names —
letting npm resolve "latest" on every install risks a peer-dependency conflict as soon as a
dependency ships a new major, e.g. `@nestjs/common`); for scaffold-mode it's a bare install
(dependencies are already declared in the generated `package.json`).

Which tool: `--pm` wins outright. Otherwise a lockfile already in the target directory is
unambiguous and used silently. Only when neither says anything — most commonly a scaffold
install into a brand new empty directory — does a real terminal get asked "Which package
manager?"; a non-interactive run in that same situation falls back to npm rather than
blocking.

## Install modes

**`merge`** (the 4 `api` combos): composes `registry/core/` → `<into>/<path>/core`, then the
combo's `shared/`, then `variants/<variant>/` over the top, rewriting the `@/lib/auth/core`
import alias to the consumer's. The consumer's project keeps its own `package.json` — the CLI
prints the combo's peer dependencies and post-install notes (including the `npm run seed`
line) instead of editing it.

**`scaffold`** (the 2 `admin` + 2 `mobile` combos): writes `shared/` + `variants/<variant>/`
**directly into the target directory** as a complete standalone app — `package.json`,
`src/`, configs, everything — then templates the package name from `--name`. For
`mobile-bare-rn` it additionally runs `packages/cli/lib/rename-native.ts`: Android package folder
move, iOS project/scheme/source renames, and a string sweep across `android/`/`ios/` +
`app.json`, so every generated app gets a unique bundle id / `applicationId`
(see `registry/mobile-apps/README.md` for the mechanics).

An explicit `--into <dir>` is trusted as that exact target directory (e.g. `--into ./admin`).
Without `--into`, a scaffold install never writes into the bare current directory — it always
creates a new subdirectory one level below cwd, named from `--name` or the combo itself (e.g.
`add admin-nextjs` with no `--into` creates `./admin-nextjs/`), the same way `create-next-app`
always starts a new project in its own folder rather than the one you ran it from.

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
outright, and each one's prune step would delete the other's files. With a single selection, a
merge-mode (`api`) combo still lands directly in the target root; a scaffold-mode (`admin`/
`mobile`) combo gets the same one-level nesting described above unless `--into` was given
explicitly. When namespaced, a given `--name` is suffixed per combo (`<name>-<comboName>`) so
sibling apps don't collide on package name.

## `@simple-auth-kit/auth-client`

The scaffolded admin/mobile apps declare `"@simple-auth-kit/auth-client": "^1.0.2"`, resolved
from the published package on npm — a scaffolded app generated outside the monorepo installs
with a plain `npm install`, no manual dependency resolution needed.

## Keeping the in-repo examples in sync

`examples/*` are themselves CLI output. After changing a combo:

```bash
cd packages/cli && npx tsx simple-auth-kit.ts add <combo> [--workspaces] --force --into ../../examples/<app>
```

`--force` is fine there — the examples hold no hand edits inside the managed `common/`, `core/`,
`infra/`, and `modules/` directories under `src/` (or `database/` at the project root). Read the
CLI's own `skipped`/`keptModified` output: anything listed is a real
hand-edit the force-copy preserved and worth reviewing. New backend dependencies must be added
to the example's own `package.json` — the CLI copies source, not deps.
