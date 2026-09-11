# dev-portal

A Next.js control panel for developing [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
itself — **not** an app the CLI ever copies to consumers, and not meant to be run standalone.

It needs the full monorepo checked out (it drives `docker compose` over every service and
replays every combo's Prisma/Drizzle migrations into a throwaway Postgres to build its ER
diagram), so there's no `degit`-a-single-folder path for this one.

## Run (from the full repo)

```bash
git clone https://github.com/shahriar-ratul/simple-auth-kit.git
cd simple-auth-kit
pnpm install
pnpm portal
```

→ http://localhost:8080

## What it does

1. **Live status for every surface in the repo** — the 8 backends, the 4 admin consoles, both
   mobile families, Postgres — each with Start/Stop/Restart buttons that shell out to
   `docker compose`.
2. **An ER diagram of the auth schema**, built by replaying each combo's migrations into a
   throwaway Postgres database and introspecting the result.
3. **Schema drift across the 4 combos** — every column compared, disagreements highlighted.

Runs on the host, not inside `docker compose` (starting/stopping compose from within a
compose-managed container would kill itself, and mounting the Docker socket into a container
effectively grants host root). Bound to `127.0.0.1`; endpoints are curl-able JSON/SVG
(`/api/status`, `/api/schema`, `/api/schema/diagram`, `POST /api/action`).

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
