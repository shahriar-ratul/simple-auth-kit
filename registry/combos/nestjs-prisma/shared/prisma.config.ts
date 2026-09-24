import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The CLI installs this file at the project root (<targetRoot>/prisma.config.ts, alongside
// database/) — Prisma's own convention, so `npx prisma generate`/`migrate deploy` need no `cd`
// and find it automatically.
export default defineConfig({
  // A folder, not a file — Prisma's multi-file schema support merges every .prisma file in it.
  // simple-auth-kit's own schema is split by domain there (schema, user, rbac, auth, audit-log, …);
  // a consumer's own models go in their own file alongside, under a name the kit doesn't use
  // (e.g. app.prisma), which the CLI never touches.
  schema: "./database/schema",
  migrations: {
    path: "./database/migrations",
    seed: "tsx database/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
