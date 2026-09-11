# admin-react-workspaces

The **workspaces**-aware Vite + React admin console from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — pairs with a backend
combo installed with `--workspaces`. Sends `X-Workspace-Id` on every workspace-scoped request.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/admin-react-workspaces admin-react-workspaces
cd admin-react-workspaces
```

## Setup

```bash
npm install
cp .env.example .env
```

`.env` (defaults to `http://localhost:3005` if unset — this app serves on port 5174 so it
can run alongside `admin-react` on 5173 against a different backend):

```bash
VITE_AUTH_API_URL=http://localhost:3005
```

## Run

```bash
npm run dev
```

→ http://localhost:5174

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_AUTH_API_URL` | no | a workspaces-variant backend's URL — defaults to `http://localhost:3005` |

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
