import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const thisDir = dirname(fileURLToPath(import.meta.url));

// Plain `import "dotenv/config"` only loads `.env` relative to the process's cwd, which misses
// the project's real `.env` at the root. Resolve from this file's own location instead and walk
// up until a `.env` is found.
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
loadNearestEnv(thisDir);

// The CLI installs this file at the project root (<targetRoot>/drizzle.config.ts, alongside
// database/) — Drizzle's own convention, so `npx drizzle-kit ...` need no `cd` and find it
// automatically. Unlike the merged auth-lib source (whose depth under destRoot varies with
// `--path`), database/ is one of the ORM data directories the CLI always roots at the project
// root next to this file (see packages/cli's ORM_LAYOUTS) — true both for a real consumer install
// and for this combo's own materialize.mjs, so schemaDir needs no environment probing.
const schemaDir = join(thisDir, "database");

export default defineConfig({
  // schema.ts is the CLI-managed file — never edit it directly, it's overwritten on every
  // update. Add your own tables in a sibling file named *.schema.ts in this same directory
  // (e.g. billing.schema.ts) instead: drizzle-kit merges every matched file's exports into one
  // schema, and the CLI only ever tracks schema.ts by exact name, so your file is never touched.
  schema: [join(schemaDir, "schema.ts"), join(schemaDir, "*.schema.ts")],
  out: join(schemaDir, "migrations"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
