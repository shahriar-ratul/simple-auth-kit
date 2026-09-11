#!/usr/bin/env node
// Composes a runnable copy of one variant of this combo into `.variant/<variant>/`.
//
// A variant is `shared/` + `variants/<variant>/` overlaid on top of each other — exactly what
// `simple-auth-kit add <combo> [--workspaces]` copies into a consumer's project. Composing it here
// too means the thing this package typechecks and runs `prove-cycle` against is byte-for-byte
// the thing the CLI emits, rather than a second wiring that can drift from it.
//
// Usage:
//   node scripts/materialize.mjs <variant>|--all [--generate]
//
// `--generate` also runs `prisma generate` in the composed directory (needed before typecheck,
// since the generated client is what `../generated/prisma/client.js` resolves to).
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMBO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VARIANTS = ["base", "workspaces"];

/** Composed trees are throwaway; only `generated/` (the Prisma client) is expensive to rebuild, so it survives. */
const REPLACED_ENTRIES = ["src", "prisma", "test", "prisma.config.ts", "tsconfig.json", ".env", ".env.example", ".gitignore"];

const TSCONFIG = {
  // Depth is fixed by the layout: <repo>/registry/combos/<combo>/.variant/<variant>/
  extends: "../../../../../tsconfig.base.json",
  compilerOptions: { paths: { "@/lib/auth/core/*": ["../../../../core/*"] } },
  include: ["src", "test", "prisma.config.ts"],
  exclude: ["node_modules", "generated"],
};

/** Each variant owns its own database — their schemas are different shapes, not different states of one. */
export function databaseUrlFor(variant, baseUrl) {
  if (variant === "base") return baseUrl;
  return baseUrl.replace(/^(.*\/)([^/?]+)(\?.*)?$/, (_m, prefix, db, query) => `${prefix}${db}_${variant}${query ?? ""}`);
}

async function rootEnv() {
  return readFile(join(COMBO_ROOT, ".env"), "utf8");
}

async function baseDatabaseUrl() {
  const match = (await rootEnv()).match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!match) throw new Error(`no DATABASE_URL in ${join(COMBO_ROOT, ".env")}`);
  return match[1];
}

export async function materialize(variant, { generate = false } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown variant "${variant}" (expected one of: ${VARIANTS.join(", ")})`);
  const dest = join(COMBO_ROOT, ".variant", variant);

  await mkdir(dest, { recursive: true });
  await Promise.all(REPLACED_ENTRIES.map((entry) => rm(join(dest, entry), { recursive: true, force: true })));

  // Order matters: the variant overlay goes last, so `variants/<variant>/test/*` replaces the
  // shared test scaffolding of the same name (that is how variant-hooks.ts is supplied).
  await cp(join(COMBO_ROOT, "shared"), dest, { recursive: true });
  await cp(join(COMBO_ROOT, "test"), join(dest, "test"), { recursive: true });
  await cp(join(COMBO_ROOT, "variants", variant), dest, { recursive: true });

  await writeFile(join(dest, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2) + "\n", "utf8");
  // Forward the whole root `.env` (AUTH_JWT_SECRET and anything else a consumer would set) —
  // only DATABASE_URL is rewritten, to point at this variant's own database.
  const withVariantDatabase = (await rootEnv()).replace(
    /^\s*DATABASE_URL\s*=.*$/m,
    `DATABASE_URL="${databaseUrlFor(variant, await baseDatabaseUrl())}"`,
  );
  await writeFile(join(dest, ".env"), withVariantDatabase, "utf8");

  if (generate) execFileSync("npx", ["prisma", "generate"], { cwd: dest, stdio: "inherit" });
  return dest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const generate = args.includes("--generate");
  const requested = args.filter((a) => !a.startsWith("--"));
  const variants = args.includes("--all") || requested.length === 0 ? VARIANTS : requested;
  for (const variant of variants) {
    const dest = await materialize(variant, { generate });
    console.log(`materialized ${variant} -> ${dest}`);
  }
}
