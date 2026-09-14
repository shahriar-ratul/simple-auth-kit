#!/usr/bin/env node
// Runs a variant's seeder against this combo's own dev database.
//
// The seeder is consumer-facing source (`variants/<variant>/database/seed.ts`, copied into every
// project the CLI installs into), so it is run here the same way a consumer runs it: from the
// materialized variant, with that variant's `.env` supplying DATABASE_URL. Nothing about the
// seeder is test scaffolding, and there is no second copy of it living in `scripts/`.
//
// Usage:
//   node scripts/seed.mjs [variant ...]                  (default: every variant)
//   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/seed.mjs base
//
// Variables set in the environment win over the variant's `.env` — see seed.ts.
import { execFileSync } from "node:child_process";
import { materialize, VARIANTS } from "./materialize.mjs";

const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const variants = requested.length ? requested : VARIANTS;

for (const variant of variants) {
  console.log(`\n=== seed: ${variant} ===\n`);
  const dest = await materialize(variant);
  execFileSync("npx", ["tsx", "database/seed.ts"], {
    cwd: dest,
    stdio: "inherit",
  });
}
