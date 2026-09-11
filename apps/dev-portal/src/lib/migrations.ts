import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { REPO_ROOT } from "./repo";
import { COMBOS, type ComboName } from "./types";

/**
 * Where each combo's migrations live. These files are the input to the schema
 * view — they are replayed into a throwaway Postgres database (see replay.ts)
 * rather than parsed in JS, so what the panel shows is what `prisma migrate
 * deploy` / `drizzle-kit migrate` would actually produce.
 */
const MIGRATIONS: Record<ComboName, { orm: "prisma" | "drizzle"; dir: string }> = {
  "nestjs-prisma": {
    orm: "prisma",
    dir: "examples/nestjs-prisma-app/prisma/migrations",
  },
  "nestjs-drizzle": {
    orm: "drizzle",
    dir: "examples/nestjs-drizzle-app/drizzle",
  },
  "express-prisma": {
    orm: "prisma",
    dir: "examples/express-prisma-app/prisma/migrations",
  },
  "express-drizzle": {
    orm: "drizzle",
    dir: "examples/express-drizzle-app/drizzle",
  },
};

/**
 * One migration file, kept whole and separate. Order is the order its own
 * tooling applies them in, and each is fed to Postgres on its own so a failure
 * can be blamed on the file that caused it.
 */
export type MigrationFile = { label: string; sql: string };
export type MigrationSet = { files: MigrationFile[]; warnings: string[] };

/** Prisma: one `migration.sql` per timestamped subdirectory, applied in name order. */
async function readPrisma(dir: string, label: string): Promise<MigrationSet> {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const files: MigrationFile[] = [];
  const warnings: string[] = [];
  for (const name of entries) {
    const path = `${label}/${name}/migration.sql`;
    try {
      files.push({ label: path, sql: await readFile(join(dir, name, "migration.sql"), "utf8") });
    } catch {
      warnings.push(`${label}/${name} has no migration.sql — skipped.`);
    }
  }
  return { files, warnings };
}

/**
 * Drizzle: the journal is the source of truth, not the directory listing.
 *
 * Globbing `*.sql` would be wrong — `nestjs-drizzle` has an orphaned
 * `0000_mean_firebird.sql` that no journal entry references, so `drizzle-kit
 * migrate` never applies it. Picking it up would replay duplicate CREATE TABLEs
 * and the whole combo would fail. Files not in the journal are reported as
 * warnings instead.
 */
async function readDrizzle(dir: string, label: string): Promise<MigrationSet> {
  const journal = JSON.parse(await readFile(join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const applied = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const files: MigrationFile[] = [];
  for (const entry of applied) {
    // Drizzle's `--> statement-breakpoint` separators are left in place: they
    // are SQL line comments, so Postgres ignores them exactly as it does when
    // drizzle-kit applies the same file.
    files.push({
      label: `${label}/${entry.tag}.sql`,
      sql: await readFile(join(dir, `${entry.tag}.sql`), "utf8"),
    });
  }

  const tags = new Set(applied.map((entry) => entry.tag));
  const orphans = (await readdir(dir))
    .filter((name) => name.endsWith(".sql") && !tags.has(name.replace(/\.sql$/, "")))
    .map((name) => `${label}/${name} is not in meta/_journal.json — it never gets applied.`);

  return { files, warnings: orphans };
}

/** Every migration file for one combo, in apply order. */
export async function migrationFiles(combo: ComboName): Promise<MigrationSet> {
  const { orm, dir } = MIGRATIONS[combo];
  // The build otherwise traces the whole repo as deployable assets because this
  // path is dynamic. This panel is only ever run from a checkout, never deployed,
  // so the files are already there.
  const absolute = join(/* turbopackIgnore: true */ REPO_ROOT, dir);
  // Warnings quote the repo-relative path — that's what a developer edits.
  return orm === "prisma" ? readPrisma(absolute, dir) : readDrizzle(absolute, dir);
}

export { COMBOS };
