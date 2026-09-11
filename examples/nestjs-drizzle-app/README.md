# nestjs-drizzle-app

A NestJS + Drizzle ORM backend built from the `nestjs-drizzle` combo of
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — sessions, JWTs, 2FA,
OAuth, password reset, and RBAC, backed by PostgreSQL via Drizzle.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/nestjs-drizzle-app nestjs-drizzle-app
cd nestjs-drizzle-app
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example src/lib/auth/.env
# edit src/lib/auth/.env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

# drizzle-kit resolves ./src/schema.ts and ./drizzle relative to the working directory,
# so this must run from src/lib/auth
npx drizzle-kit migrate
```

## Seed RBAC (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npm run seed
```

Idempotent; without the admin env vars it still seeds the permission catalog and default
roles but skips creating an admin user.

## Run

```bash
npm run start
```

- API: http://localhost:3002 (override with `PORT`) — Swagger UI at `/docs`

## Environment variables

Same set as [`nestjs-prisma-app`](../nestjs-prisma-app#environment-variables) — `DATABASE_URL`,
`AUTH_JWT_SECRET`, `PORT`, `SEED_ADMIN_*`, `SEED_SUPERADMIN_*`, OAuth vars, `DOCS_USERNAME`/`DOCS_PASSWORD`.

## Pair with a frontend

Point [`admin-nextjs`](../../apps/admin-nextjs) or `admin-react` at this API
(`NEXT_PUBLIC_AUTH_API_URL=http://localhost:3002` / `VITE_AUTH_API_URL=http://localhost:3002`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
