# admin-nextjs

A Next.js admin console for the [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
backend — users, roles & permissions, audit log, content domains, 2FA, live activity feed.
Uses NextAuth v5 with an edge `proxy.ts` route guard, and talks to the backend through
[`@simple-auth-kit/auth-client`](https://www.npmjs.com/package/@simple-auth-kit/auth-client).

This is a **standalone copy** — it doesn't need the full monorepo, since `auth-client` is
published on npm. Clone just this folder:

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/admin-nextjs admin-nextjs
cd admin-nextjs
```

## Prerequisites

- Node.js (built/verified on v26)
- A running backend — see [`nestjs-prisma`](https://github.com/shahriar-ratul/simple-auth-kit/tree/main/examples/nestjs-prisma-app),
  or any other combo from simple-auth-kit

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
# Your running backend's URL. Public by design — the browser talks to it directly with a
# Bearer token, so there's no server-side secret to protect here.
NEXT_PUBLIC_AUTH_API_URL=http://localhost:3001

# NextAuth v5 session-JWT signing secret.
AUTH_SECRET=<openssl rand -base64 32>
```

## Run

```bash
npm run dev
```

→ http://localhost:3000. Log in with the admin credentials you seeded on the backend.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_AUTH_API_URL` | yes | the backend's browser-reachable URL |
| `AUTH_SECRET` | yes | NextAuth v5 session-JWT signing secret |
| `AUTH_API_INTERNAL_URL` | no | server-side (NextAuth authorize, proxy token verify) backend URL, if different from `NEXT_PUBLIC_AUTH_API_URL` (e.g. in-cluster/container DNS name) — defaults to `NEXT_PUBLIC_AUTH_API_URL` |

## Note on variants

This is the **base** (no-workspaces) console. For a workspace-aware backend/console pair,
use `admin-nextjs-workspaces` and a backend combo installed with `--workspaces` instead —
they use a different route-guarding trust model (client-side session recheck vs. edge
middleware) and aren't drop-in compatible with each other.

## Source

Full source and the other admin console (`admin-react`): [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).
