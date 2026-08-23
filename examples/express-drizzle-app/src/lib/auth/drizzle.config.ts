import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Consumers run this from this file's own directory (`cd src/lib/auth && npx drizzle-kit
// migrate`, per the install instructions). Plain `import "dotenv/config"` only loads `.env`
// relative to the process's cwd, which misses the project's real `.env` at the root. Resolve
// from this file's own location instead and walk up until a `.env` is found.
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
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
