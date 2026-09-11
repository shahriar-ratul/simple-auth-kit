# admin-react

A Vite + React admin console for the [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
backend (base, non-workspaces variant) — same feature set as `admin-nextjs`, built with Vite
instead of Next.js.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/admin-react admin-react
cd admin-react
```

## Setup

```bash
npm install
cp .env.example .env
```

`.env` (defaults to `http://localhost:3001` if unset):

```bash
VITE_AUTH_API_URL=http://localhost:3001
```

## Run

```bash
npm run dev
```

→ http://localhost:5173 (Vite dev server)

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_AUTH_API_URL` | no | backend URL — defaults to `http://localhost:3001` |

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
