# admin-nextjs-workspaces

The **workspaces**-aware Next.js admin console from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — pairs with a backend
combo installed with `--workspaces` (e.g. `nestjs-prisma-app-workspaces`). Sends
`X-Workspace-Id` on every workspace-scoped request.

Unlike the base [`admin-nextjs`](../admin-nextjs) (NextAuth v5 edge `proxy.ts` guard), this
console re-verifies the session client-side on every navigation — a deliberate split, not a
bug; both are correct for their own architecture.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/admin-nextjs-workspaces admin-nextjs-workspaces
cd admin-nextjs-workspaces
```

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
NEXT_PUBLIC_AUTH_API_URL=http://localhost:3005   # a workspaces-variant backend
AUTH_SECRET=<openssl rand -base64 32>
```

## Run

```bash
npm run dev
```

→ http://localhost:3010

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_AUTH_API_URL` | yes | the workspaces-variant backend's browser-reachable URL |
| `AUTH_SECRET` | yes | NextAuth v5 session-JWT signing secret |
| `AUTH_API_INTERNAL_URL` | no | server-side backend URL if different (e.g. in-cluster DNS) |

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
