import { existsSync, readFileSync } from "node:fs";
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
// drizzle/) — Drizzle's own convention, so `npx drizzle-kit ...` need no `cd` and find it
// automatically. schema.ts itself stays inside the merged auth-lib directory with the rest of
// this combo's source, so its directory can't be a fixed relative string once this file moves.
//
// Two contexts share this file, and they disagree about where that directory is:
//   - registry/combos/*/scripts/materialize.mjs (this combo's own dev/typecheck/prove-cycle
//     loop) flatly composes shared/+variants/<v>/ into one directory, so schema.ts's directory
//     is right next to this file — no .simple-auth-kit.json is ever written there.
//   - a real consumer install: this file lives at the project root while schema.ts stays nested
//     under the merged auth-lib directory, whose path is recorded in .simple-auth-kit.json
//     (falling back to the CLI's own default when that file is absent).
// Probing for the sibling first covers both without hardcoding either shape.
function resolveSchemaDir(): string {
  const sibling = join(thisDir, "src");
  if (existsSync(join(sibling, "schema.ts"))) return sibling;

  let authLibPath = "src/lib/auth";
  try {
    const parsed = JSON.parse(readFileSync(join(thisDir, ".simple-auth-kit.json"), "utf8")) as { path?: string };
    if (parsed.path) authLibPath = parsed.path;
  } catch {
    // no .simple-auth-kit.json (defaults apply) — fall through with the CLI's own default path
  }
  return join(thisDir, authLibPath, "src");
}

const schemaDir = resolveSchemaDir();

export default defineConfig({
  dialect: "postgresql",
  // schema.ts is the CLI-managed file — never edit it directly, it's overwritten on every
  // update. Add your own tables in a sibling file named *.schema.ts in this same directory
  // (e.g. billing.schema.ts) instead: drizzle-kit merges every matched file's exports into one
  // schema, and the CLI only ever tracks schema.ts by exact name, so your file is never touched.
  schema: [join(schemaDir, "schema.ts"), join(schemaDir, "*.schema.ts")],
  out: join(thisDir, "drizzle"),
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
