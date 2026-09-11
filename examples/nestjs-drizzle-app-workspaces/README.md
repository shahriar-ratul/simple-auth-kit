# nestjs-drizzle-app-workspaces

The **workspaces** variant of the `nestjs-drizzle` combo from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — users belong to
workspaces and hold different roles in each. Same NestJS + Drizzle backend as
[`nestjs-drizzle-app`](../nestjs-drizzle-app), plus a workspace layer.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-drizzle-app-workspaces nestjs-drizzle-app-workspaces
cd nestjs-drizzle-app-workspaces
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example src/lib/auth/.env
# edit src/lib/auth/.env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

(cd src/lib/auth && npx drizzle-kit migrate)
```

## Seed (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' \
SEED_WORKSPACE_NAME='Default workspace' \
npm run seed
```

## Run

```bash
npm run start
```

- API: http://localhost:3006 (override with `PORT`) — Swagger UI at `/docs`

## Workspaces specifics

- Every workspace-scoped request must send an `X-Workspace-Id` header — see
  `WorkspaceController` and `authz.guard.ts` in `src/lib/auth`.
- A user has no roles until they belong to a workspace: `POST /workspaces` makes the caller
  its first admin.

## Environment variables

Same as [`nestjs-drizzle-app`](../nestjs-drizzle-app#environment-variables), plus
`SEED_WORKSPACE_NAME` (names the first seeded workspace, default `"Default workspace"`).

## Pair with a frontend

Use `admin-nextjs-workspaces` or `admin-react-workspaces` — the plain consoles don't send
`X-Workspace-Id` and won't work against this backend.

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
