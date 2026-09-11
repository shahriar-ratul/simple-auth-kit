# express-prisma-app

An Express + Prisma backend built from the `express-prisma` combo of
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — sessions, JWTs, 2FA,
OAuth, password reset, and RBAC, backed by PostgreSQL via Prisma.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/examples/express-prisma-app express-prisma-app
cd express-prisma-app
```

## Setup

```bash
npm install
cp src/lib/auth/.env.example src/lib/auth/.env
# edit src/lib/auth/.env: DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public

echo "AUTH_JWT_SECRET=$(openssl rand -base64 32)" >> .env   # required, no default

(cd src/lib/auth && npx prisma generate && npx prisma migrate deploy)
```

## Seed RBAC (required once)

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Admin12345!' npm run seed
```

## Run

```bash
npm run start
```

- API: http://localhost:3003 (override with `PORT`)
- OpenAPI spec served at `/docs` and `/docs-json`

## Environment variables

Same set as [`nestjs-prisma-app`](../nestjs-prisma-app#environment-variables) — `DATABASE_URL`,
`AUTH_JWT_SECRET`, `PORT`, `SEED_ADMIN_*`, `SEED_SUPERADMIN_*`, OAuth vars, `DOCS_USERNAME`/`DOCS_PASSWORD`.

## Pair with a frontend

Point [`admin-nextjs`](../../apps/admin-nextjs) or `admin-react` at this API
(`NEXT_PUBLIC_AUTH_API_URL=http://localhost:3003` / `VITE_AUTH_API_URL=http://localhost:3003`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
