import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The CLI installs this file at the project root (<targetRoot>/prisma.config.ts, alongside
// database/) — Prisma's own convention, so `npx prisma generate`/`migrate deploy` need no `cd`
// and find it automatically.
export default defineConfig({
  // A folder, not a file — Prisma's multi-file schema support merges every .prisma file inside
  // it. A consumer's own models go in their own sibling file under database/schema/, never
  // touched by the CLI (it only ever manages database/schema/simple-auth-kit.prisma, by name).
  schema: "./database/schema",
  migrations: {
    path: "./database/migrations",
    seed: "tsx database/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
