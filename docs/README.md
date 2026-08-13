# easy-auth — documentation

Start here after cloning. Each doc is self-contained; together they cover what this repo is,
how to run it, and how to work on it.

| Doc | Read it when |
|---|---|
| [getting-started.md](getting-started.md) | You just cloned and want everything running (docker or manual) and a login that works. |
| [architecture.md](architecture.md) | You want the mental model: registry → CLI → consumer, combos, variants, and why it's shaped this way. |
| [backend-api.md](backend-api.md) | You're calling or extending the backend: every endpoint, the response envelope, pagination, permission slugs, the realtime feed. |
| [admin-console.md](admin-console.md) | You're working on the admin console: auth flow (NextAuth v5 + proxy), page inventory, UI patterns, env vars. |
| [development.md](development.md) | You're changing code: the combo dev loop, regenerating examples, the auth-client rebuild gotcha, and the add-a-domain recipe. |

Two other places hold context the docs deliberately don't duplicate:

- **`plan/brief.md`** — the decision log. Every settled architectural decision, numbered, with
  the reasoning and what each one reversed. Read it before changing anything architectural;
  update it when a decision changes.
- **`plan/plan.md`** — the executed plan for the admin-console/backend parity build
  (2026-08-12), kept as a record of what was built and how it was verified.

## The 60-second version

This is a **shadcn-style auth library**: the source of truth lives in `registry/`, and a CLI
(`easy-auth add <combo> [--workspaces]`) copies it into a consumer's repo. Nothing is installed
as an npm dependency. The repo also contains a full reference deployment proving it all works:
4 backend combos × 2 variants = 8 runnable example backends, a shared typed API client, 4 admin
consoles, and 4 mobile apps.

The most-developed pair — the one to look at first — is:

- **Backend**: `registry/combos/nestjs-prisma` (base variant) → running as
  `examples/nestjs-prisma-app` on port **3001**. Auth (JWT + refresh rotation, 2FA, OAuth-shaped
  flows, password reset), DB-resolved CASL RBAC, users/roles/permissions/audit-log admin surface,
  plus countries/languages/customers CRUD, a socket.io live audit feed, rate limiting, and
  Swagger/Scalar docs.
- **Console**: `apps/admin-nextjs` on port **3000**. Next.js 16 + NextAuth v5 credentials
  session + edge `proxy.ts` route guard, shadcn/ui + Tailwind v4, MobX + CASL permission-gated
  pages for every backend domain, live activity feed.

```bash
docker compose up --build     # postgres + all 8 backends + 4 consoles
# then: seed an admin (see getting-started.md) and log in at http://localhost:3000
```
