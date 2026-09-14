#!/usr/bin/env node
// Composes a runnable copy of one variant of this combo into `.variant/<variant>/`.
//
// A variant is `shared/` + `variants/<variant>/` overlaid on top of each other — exactly what
// `simple-auth-kit add <combo> [--workspaces]` copies into a consumer's project. Composing it here
// too means the thing this package typechecks and runs `prove-cycle` against is byte-for-byte
// the thing the CLI emits, rather than a second wiring that can drift from it.
//
// Usage:
//   node scripts/materialize.mjs <variant>|--all
//
// Unlike the Prisma combos there is nothing to code-generate afterwards: Drizzle's schema *is*
// the TypeScript in `database/schema.ts`, so a composed tree is immediately typecheckable.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMBO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VARIANTS = ["base", "workspaces"];

/** Composed trees are throwaway — every entry a variant owns is replaced wholesale on each run. */
const REPLACED_ENTRIES = [
  "src",
  "database",
  "test",
  "drizzle.config.ts",
  "tsconfig.json",
  ".env",
  ".env.example",
  ".gitignore",
];

const TSCONFIG = {
  // Depth is fixed by the layout: <repo>/registry/combos/<combo>/.variant/<variant>/
  // module/moduleResolution are overridden to CommonJS/bundler, not inherited from the root
  // tsconfig.base.json's NodeNext - this tree proves the exact module system the CLI ships to a
  // consumer's project (see shared/root/tsconfig.build.json), not the monorepo's own ESM setup.
  extends: "../../../../../tsconfig.base.json",
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "bundler",
    paths: {
      "@/lib/auth/core/*": ["../../../../core/*"],
      "@/database/*": ["./database/*"],
    },
  },
  include: ["src", "test", "database", "drizzle.config.ts"],
  exclude: ["node_modules"],
};

/** Each variant owns its own database — their schemas are different shapes, not different states of one. */
export function databaseUrlFor(variant, baseUrl) {
  if (variant === "base") return baseUrl;
  return baseUrl.replace(
    /^(.*\/)([^/?]+)(\?.*)?$/,
    (_m, prefix, db, query) => `${prefix}${db}_${variant}${query ?? ""}`,
  );
}

async function rootEnv() {
  return readFile(join(COMBO_ROOT, ".env"), "utf8");
}

export async function baseDatabaseUrl() {
  const match = (await rootEnv()).match(
    /^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m,
  );
  if (!match) throw new Error(`no DATABASE_URL in ${join(COMBO_ROOT, ".env")}`);
  return match[1];
}

/**
 * `drizzle-kit migrate` applies migrations but will not create the database to apply them to
 * (Prisma's `migrate dev` does, which is why the reference combo needs no equivalent). Both
 * scripts that touch a database call this first so a clean checkout can prove itself.
 */
export async function ensureDatabase(url) {
  const { Client } = await import("pg");
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    // Identifier, not a value — pg has no placeholder for one, so it is quoted by hand.
    if (!rowCount)
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export async function materialize(variant) {
  if (!VARIANTS.includes(variant))
    throw new Error(
      `unknown variant "${variant}" (expected one of: ${VARIANTS.join(", ")})`,
    );
  const dest = join(COMBO_ROOT, ".variant", variant);

  await mkdir(dest, { recursive: true });
  await Promise.all(
    REPLACED_ENTRIES.map((entry) =>
      rm(join(dest, entry), { recursive: true, force: true }),
    ),
  );

  // Order matters: the variant overlay goes last, so `variants/<variant>/test/*` replaces the
  // shared test scaffolding of the same name (that is how variant-hooks.ts is supplied).
  await cp(join(COMBO_ROOT, "shared"), dest, { recursive: true });
  await cp(join(COMBO_ROOT, "test"), join(dest, "test"), { recursive: true });
  await cp(join(COMBO_ROOT, "variants", variant), dest, { recursive: true });

  await writeFile(
    join(dest, "tsconfig.json"),
    JSON.stringify(TSCONFIG, null, 2) + "\n",
    "utf8",
  );
  // Forward the whole root `.env` (AUTH_JWT_SECRET and anything else a consumer would set) —
  // only DATABASE_URL is rewritten, to point at this variant's own database.
  const withVariantDatabase = (await rootEnv()).replace(
    /^\s*DATABASE_URL\s*=.*$/m,
    `DATABASE_URL="${databaseUrlFor(variant, await baseDatabaseUrl())}"`,
  );
  await writeFile(join(dest, ".env"), withVariantDatabase, "utf8");

  return dest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const requested = args.filter((a) => !a.startsWith("--"));
  const variants =
    args.includes("--all") || requested.length === 0 ? VARIANTS : requested;
  for (const variant of variants) {
    const dest = await materialize(variant);
    console.log(`materialized ${variant} -> ${dest}`);
  }
}
