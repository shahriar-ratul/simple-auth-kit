# simple-auth-kit

A shadcn-style auth library: source lives in `registry/`, a CLI copies it into your own
project — nothing is ever installed as a runtime dependency. Three kinds of installable
product — backend combos (`api`), admin consoles (`admin`), and mobile apps (`mobile`) — each
in a **base** and a **workspaces** variant.

**New here? Start with [`docs/`](docs/README.md)** — getting started, architecture, the CLI,
the backend API reference, the admin console internals, and development workflows.

## Try it

No clone needed — the CLI is [published on npm](https://www.npmjs.com/package/@simple-auth-kit/cli)
with the registry it installs from bundled in. Add `--workspaces` to any of these for the
workspaces variant. `npx @simple-auth-kit/cli` alone, in a real terminal, launches a guided
picker (`--help` prints the full command reference instead); `npx @simple-auth-kit/cli update`
later re-syncs whatever you installed, no arguments needed.
Full details: [`docs/cli.md`](docs/cli.md).

**Not sure yet which combo you want?** `init` writes `.simple-auth-kit.json` (install path,
alias), then walks you through the same picker (`add` with no arguments also does, without the
config file):
```bash
npx @simple-auth-kit/cli init
```

**Already know what you want?** Run the exact combo directly:

**`api` — merges into `src/lib/auth` of an existing project:**
```bash
npx @simple-auth-kit/cli add nestjs-prisma --into .
npx @simple-auth-kit/cli add nestjs-drizzle --into .
npx @simple-auth-kit/cli add express-prisma --into .
npx @simple-auth-kit/cli add express-drizzle --into .
```

**`admin` — a whole new standalone app, scaffolded at the target:**
```bash
npx @simple-auth-kit/cli add admin-nextjs --into ./admin
npx @simple-auth-kit/cli add admin-react --into ./admin
```

**`mobile` — a whole new standalone app, scaffolded at the target:**
```bash
npx @simple-auth-kit/cli add mobile-expo --into ./mobile
npx @simple-auth-kit/cli add mobile-bare-rn --into ./mobile
```

## The reference deployment

This repo also contains a full reference deployment proving it all works: 8 runnable example
backends, 4 admin consoles, 4 mobile apps, a shared typed API client, and a dev portal.

- Run it (docker or manual, prerequisites, seeding, port map): [`docs/getting-started.md`](docs/getting-started.md)
- Pull just one app without cloning the whole repo: [`docs/clone-apps.md`](docs/clone-apps.md)
- The dev portal (live status, ER diagram, schema-drift check): [`docs/dev-portal.md`](docs/dev-portal.md)

## Repo structure

| Path | What it is |
|---|---|
| `registry/` | Source of truth — `core/` (framework-free auth logic), `combos/*` (the 4 `api` products), `admin-apps/`, `mobile-apps/`. Never installed as a dependency; copied by the CLI. |
| `packages/cli/` | The `@simple-auth-kit/cli` package — `init`, `add`, `update`, `diff`. |
| `packages/auth-client/` | Shared typed API client (`@simple-auth-kit/auth-client`) used by all 8 client apps. |
| `examples/` | 8 fresh consumer projects, each `simple-auth-kit add`-installed end to end — the runnable backends. |
| `apps/` | The 8 runnable client apps (4 admin, 4 mobile) plus `dev-portal` (repo tooling). |
| `docs/` | The documentation set — start at `docs/README.md`. |
| `plan/brief.md` | Settled architectural decisions — read before changing anything architectural. |

## Development

Working on this repo, not just using it? Combo dev loop, regenerating examples, the
auth-client rebuild gotcha, whole-workspace checks, known gaps:
[`docs/development.md`](docs/development.md).

## License

MIT — see [LICENSE](LICENSE).
