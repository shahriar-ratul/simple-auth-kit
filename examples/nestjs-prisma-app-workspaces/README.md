# nestjs-prisma-app-workspaces

The **workspaces** variant of the `nestjs-prisma` combo from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — users belong to
workspaces and hold different roles in each. Same NestJS + Prisma backend as
[`nestjs-prisma-app`](../nestjs-prisma-app), plus a workspace layer.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-prisma-app-workspaces nestjs-prisma-app-workspaces
cd nestjs-prisma-app-workspaces
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

npx prisma generate && npx prisma migrate deploy
```

## Seed (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' \
SEED_WORKSPACE_NAME='Default workspace' \
npm run seed
```

Roles are scoped to a workspace here, so the seeder also creates the first one
(`SEED_WORKSPACE_NAME`, default `"Default workspace"` if unset).

## Run

```bash
npm run start
```

- API: http://localhost:3005 (override with `PORT`) — Swagger UI at `/docs`

## Workspaces specifics

- **Every workspace-scoped request must send an `X-Workspace-Id` header** — see
  `WorkspaceController` and `authz.guard.ts` in `src/lib/auth`.
- A user has no roles until they belong to a workspace: `POST /workspaces` makes the caller
  its first admin.

## Environment variables

Same as [`nestjs-prisma-app`](../nestjs-prisma-app#environment-variables), plus:

| Variable | Required | Notes |
|---|---|---|
| `SEED_WORKSPACE_NAME` | no | names the first seeded workspace (default: `"Default workspace"`) |

## Pair with a frontend

Use [`admin-nextjs-workspaces`](../../apps/admin-nextjs-workspaces) or
[`admin-react-workspaces`](../../apps/admin-react-workspaces) — the plain
`admin-nextjs`/`admin-react` consoles don't send `X-Workspace-Id` and won't work against this
backend.

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
