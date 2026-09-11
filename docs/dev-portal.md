# The dev portal

```bash
pnpm portal                  # -> http://localhost:8080
```

A Next.js app under `apps/dev-portal/`, run on the host (not in compose — a portal inside
compose would kill itself on "Stop all", and mounting the Docker socket into a container
effectively grants host root). Three things:

1. **Every surface in this repo, with live status** — the 8 backends as framework × ORM
   matrices, the 4 consoles, both mobile families, Postgres — each with Start/Stop/Restart
   buttons that shell out to `docker compose`. It distinguishes *responding* from *running in
   Docker*: a backend you started by hand shows as **Outside Docker**.
2. **An ER diagram of the auth schema**, built by replaying each combo's migration files into
   a throwaway Postgres database and introspecting the result — never by parsing SQL in JS —
   so an `ALTER TABLE` in a later migration counts exactly as much as the `CREATE TABLE` it
   amends. Needs Postgres running; it never falls back to a less accurate answer.
3. **Schema drift across the 4 combos** — every column compared across all four; disagreements
   (type, nullability, missing) are highlighted in the diagram and listed. Currently **0 of 87
   columns** drift.

The endpoints are curl-able JSON/SVG (`/api/status`, `/api/schema`, `/api/schema/diagram`,
POST `/api/action`). Hardening: bound to `127.0.0.1`, service names and action verbs checked
against fixed allowlists, `docker` invoked with argument arrays (never a shell string),
cross-origin POSTs refused, request bodies capped at 4 KB.
