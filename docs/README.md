# simple-auth-kit — documentation

Start here after cloning. Each doc is self-contained; together they cover what this repo is,
how to run it, and how to work on it.

| Doc                                      | Read it when                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getting-started.md](getting-started.md) | You just cloned and want everything running (docker or manual) and a login that works.                                                                                  |
| [architecture.md](architecture.md)       | You want the mental model: registry → CLI → consumer, the three kinds (api/admin/mobile), variants, and why it's shaped this way.                                       |
| [cli.md](cli.md)                         | You're using or changing the `simple-auth-kit` CLI: commands, flags, merge vs. scaffold installs, the lockfile, multi-kind generation.                                  |
| [backend-api.md](backend-api.md)         | You're calling or extending the backend: every endpoint, the response envelope, pagination, permission slugs, the realtime feed — and which combos have which features. |
| [admin-console.md](admin-console.md)     | You're working on any of the 4 admin consoles: auth-guard models, page inventory, UI patterns, env vars.                                                                |
| [development.md](development.md)         | You're changing code: the combo dev loop, regenerating examples, the auth-client rebuild gotcha, the add-a-domain recipe.                                               |
| [clone-apps.md](clone-apps.md)           | You want just one app's source — `degit` commands per backend/console/mobile app, no full clone.                                                                        |
| [dev-portal.md](dev-portal.md)           | You want the dev portal's live status board, ER diagram, and schema-drift check explained.                                                                              |

Three other places hold context these docs deliberately don't duplicate:

- **`registry/README.md`** (+ `registry/admin-apps/README.md`, `registry/mobile-apps/README.md`) —
  the registry's own layout convention: the byte-identical hoisting rule, the shared/variant
  composition, the seeder contract, the proof harness. Read before touching `registry/`.
- **`plan/brief.md`** — the decision log. Every settled architectural decision, numbered, with
  the reasoning and what each one reversed. Read it before changing anything architectural;
  update it when a decision changes.
- **`plan/plan.md`** — the executed plan for the 2026-08-12 admin-console/backend parity build,
  kept as a record of what was built and how it was verified.

## The 60-second version

This is a **shadcn-style auth library**: the source of truth lives in `registry/`, and a CLI
copies it into a consumer's repo. Nothing is installed as an npm dependency. There are three
kinds of installable product:

- **`api`** — 4 backend combos (`nestjs-prisma`, `nestjs-drizzle`, `express-prisma`,
  `express-drizzle`), merged into an existing project's `src` (configurable).
- **`admin`** — 2 admin console apps (`admin-nextjs`, `admin-react`), scaffolded as whole
  standalone apps.
- **`mobile`** — 2 mobile apps (`mobile-expo`, `mobile-bare-rn`), also scaffolded.

Every product ships in a **base** variant (global roles) and a **workspaces** variant
(per-workspace roles, `X-Workspace-Id` header), chosen at install time.

The repo also contains a full reference deployment proving it all works: 8 runnable example
backends (4 combos × 2 variants), a shared typed API client, 4 admin consoles, and 4 mobile
apps — plus a dev portal that watches all of it.

The most-developed pair — the one to look at first — is:

- **Backend**: `registry/combos/nestjs-prisma` (base variant) → running as
  `examples/nestjs-prisma-app` on port **3001**. Auth (JWT + refresh rotation, 2FA, OAuth-shaped
  flows, password reset), DB-resolved CASL RBAC, users/roles/permissions/audit-log admin surface,
  countries/languages/customers CRUD, a socket.io live audit feed, HTTP throttling, and
  Swagger/Scalar docs.
- **Console**: `apps/admin-nextjs` on port **3000**. Next.js 16 + NextAuth v5 credentials
  session + edge `proxy.ts` route guard, shadcn/ui + Tailwind v4, MobX + CASL permission-gated
  pages for every backend domain, live activity feed.

```bash
cp .env.example .env          # fill in the secrets (openssl rand -base64 32 each)
docker compose up --build     # postgres + redis (rate limiter) + all 8 backends + 4 consoles
# then: seed an admin (see getting-started.md) and log in at http://localhost:3000
```
