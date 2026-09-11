# express-drizzle-app-workspaces

The **workspaces** variant of the `express-drizzle` combo from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit).

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/express-drizzle-app-workspaces express-drizzle-app-workspaces
cd express-drizzle-app-workspaces
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example .env
# edit .env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

npx drizzle-kit migrate
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

- API: http://localhost:3008 (override with `PORT`)

## Workspaces specifics

- Every workspace-scoped request must send an `X-Workspace-Id` header — see
  `workspace.router.ts` and `authz.middleware.ts` in `src/lib/auth`.
- A user has no roles until they belong to a workspace: `POST /workspaces` makes the caller
  its first admin.

## Environment variables

Same as [`express-drizzle-app`](../express-drizzle-app#environment-variables), plus
`SEED_WORKSPACE_NAME` (default `"Default workspace"`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
