import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// The CLI installs this file at the project root (<targetRoot>/prisma.config.ts, alongside
// database/) — Prisma's own convention, so `npx prisma generate`/`migrate deploy` need no `cd`
// and find it automatically. Plain `import "dotenv/config"` only loads `.env` relative to the
// process's cwd, so resolve from this file's own location instead and walk up until a `.env` is
// found — usually one hop, but kept general in case this ever installs somewhere non-default.
function loadNearestEnv(startDir: string): void {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadNearestEnv(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  // A folder, not a file — Prisma's multi-file schema support merges every .prisma file inside
  // it. A consumer's own models go in their own sibling file under database/schema/, never
  // touched by the CLI (it only ever manages database/schema/simple-auth-kit.prisma, by name).
  schema: "database/schema",
  migrations: {
    path: "database/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
