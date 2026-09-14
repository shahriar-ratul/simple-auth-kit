#!/usr/bin/env node
// Runs the black-box proof against one or both variants of this combo.
//
// Each variant is materialized, its migrations applied to its own database, seeded, and then
// `test/prove-cycle.ts` is run inside it with AUTH_VARIANT set — the test asserts the shared auth
// cycle for both, plus the workspace isolation properties for the workspace variant.
//
// The seed step is not a convenience. "The seeder is a prerequisite, not an extra": until it has
// run there is no role flagged `isDefault`, so a signup is given nothing and the very first
// assertion about database-resolved roles fails. Running it here means the proof states that
// dependency instead of inheriting it from whatever the developer's database happened to contain.
//
// Usage: node scripts/prove-cycle.mjs [variant ...]   (default: every variant)
import { execFileSync } from "node:child_process";
import {
  baseDatabaseUrl,
  databaseUrlFor,
  ensureDatabase,
  materialize,
  VARIANTS,
} from "./materialize.mjs";

const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const variants = requested.length ? requested : VARIANTS;

for (const variant of variants) {
  console.log(`\n=== prove-cycle: ${variant} ===\n`);
  const dest = await materialize(variant);
  await ensureDatabase(databaseUrlFor(variant, await baseDatabaseUrl()));
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    cwd: dest,
    stdio: "inherit",
  });
  // The consumer-facing seeder, run exactly as a consumer runs it. Idempotent, so a database that
  // has already been seeded is unaffected.
  execFileSync("npx", ["tsx", "database/seed.ts"], {
    cwd: dest,
    stdio: "inherit",
  });
  execFileSync("npx", ["tsx", "test/prove-cycle.ts"], {
    cwd: dest,
    stdio: "inherit",
    env: { ...process.env, AUTH_VARIANT: variant },
  });
}
