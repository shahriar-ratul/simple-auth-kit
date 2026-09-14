#!/usr/bin/env node
// Authors a migration for one variant and copies it back into the registry.
//
// Prisma will only resolve this combo's config when the working directory is the one holding
// `prisma.config.ts` (its `schema`/`migrations` paths are relative) — otherwise it fails with
// "The datasource.url property is required". That directory is the materialized variant, so
// migrations are generated there and copied back into `variants/<variant>/database/migrations`,
// which is what the CLI actually ships.
//
// Usage: node scripts/migrate.mjs <variant> [--name <migration-name>]
import { execFileSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materialize, VARIANTS } from "./materialize.mjs";

const COMBO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const nameIndex = args.indexOf("--name");
const name = nameIndex === -1 ? "init" : args[nameIndex + 1];
const variants = args.filter(
  (a, i) => !a.startsWith("--") && i !== nameIndex + 1,
);

for (const variant of variants.length ? variants : VARIANTS) {
  const dest = await materialize(variant);
  execFileSync("npx", ["prisma", "migrate", "dev", "--name", name], {
    cwd: dest,
    stdio: "inherit",
  });

  const registryMigrations = join(
    COMBO_ROOT,
    "variants",
    variant,
    "database",
    "migrations",
  );
  await rm(registryMigrations, { recursive: true, force: true });
  await cp(join(dest, "database", "migrations"), registryMigrations, {
    recursive: true,
  });
  console.log(
    `\nwrote migrations back to variants/${variant}/database/migrations`,
  );
}
