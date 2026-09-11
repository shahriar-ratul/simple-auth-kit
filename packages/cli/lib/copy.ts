import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

// Never copied out of the registry: build output, the registry's own package/tsconfig wiring,
// and the per-variant test harness. A consumer gets source, not this repo's scaffolding.
export const NEVER_COPY = new Set(["node_modules", "dist", "generated", "test", "scripts", ".variant", "package.json", "tsconfig.json", ".env"]);

// For "scaffold" installs (admin/mobile apps materialized as whole standalone projects, not
// merged into an existing one): package.json/tsconfig.json are real, consumer-facing content
// here, not the registry's own dev wiring, so they're copied like any other file.
export const SCAFFOLD_NEVER_COPY = new Set(["node_modules", "dist", "generated", "test", "scripts", ".variant", ".env"]);

export interface CopyOptions {
  /**
   * Rewrites this literal string to `aliasTo` inside every copied `.ts`/`.tsx` file — used to
   * retarget the core package's placeholder import alias to the consumer's configured one. Omit
   * both for installs (e.g. scaffold-mode admin/mobile apps) that have no such alias to rewrite.
   */
  aliasFrom?: string;
  aliasTo?: string;
  /**
   * Additional literal-string replacements applied to every copied `.ts`/`.tsx` file, alongside
   * the alias rewrite above. Used by the ORM combos: `prisma`/`drizzle`'s config+data folder
   * relocates to the project root on a real install, so the generated client's import path
   * inside every copied source file has to change to match (see `installMerge` in
   * `cli/simple-auth-kit.ts`) — the registry source itself keeps the path that's correct for its
   * own dev/typecheck loop, where nothing has moved.
   */
  extraRewrites?: { from: string; to: string }[];
  /**
   * The previous install's sha256-by-path manifest. A destination file whose current content
   * no longer matches what was recorded is a file the user edited, and is left alone.
   */
  previous?: Record<string, string>;
  /** Overwrite user-modified files anyway. */
  force?: boolean;
  /** Paths (relative to destRoot, same form as `previous`'s keys) to overwrite even though
   * they're locally modified — a per-file version of `force`, for when only some conflicts were
   * approved (e.g. via an interactive per-file prompt) rather than all of them. */
  forcePaths?: Set<string>;
  /** Paths (relative to destRoot, POSIX separators) this install must not write or delete. */
  ignore?: string[];
  /** Overrides the default skip-by-name set (see NEVER_COPY / SCAFFOLD_NEVER_COPY). */
  neverCopy?: Set<string>;
  /**
   * Compute everything (manifest, skipped/ignored/updated classification) without writing or
   * deleting anything on disk — for a "what would change" check before actually applying it.
   */
  dryRun?: boolean;
  /**
   * When set, every file whose on-disk content differs from what's about to be written gets a
   * `{path, oldContent, newContent}` entry pushed onto this array — for rendering an actual
   * diff (see `cmdDiff`), not just a filename list. Typically paired with `force: true` and
   * `dryRun: true` so a locally-modified file's difference is captured too, not silently
   * skipped the way a real install would.
   */
  collectDiffs?: DiffEntry[];
}

export interface DiffEntry {
  /** Path relative to destRoot, POSIX separators — same form as CopyResult's arrays. */
  path: string;
  /** null when the file doesn't exist on disk yet (a brand-new file). */
  oldContent: string | null;
  newContent: string;
}

export interface CopyResult {
  /** sha256 by path relative to destRoot, for every file this install now owns. */
  manifest: Record<string, string>;
  /** Files left alone because the user had edited them. */
  skipped: string[];
  /** Files left alone because they are on the ignore list. */
  ignored: string[];
  /** Files that are new or whose content differs from what's currently on disk — written (or,
   * under `dryRun`, would be written) this run. Anything not in skipped/ignored/updated was
   * already byte-identical to what's being installed — genuinely nothing to do for it. */
  updated: string[];
}

export const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");
export const toPosix = (path: string) => path.split(sep).join("/");

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function copyOneFile(srcPath: string, destPath: string, destRoot: string, opts: CopyOptions, result: CopyResult): Promise<void> {
  const rel = toPosix(relative(destRoot, destPath));

  if (opts.ignore?.includes(rel)) {
    result.ignored.push(rel);
    const existing = await readIfExists(destPath);
    if (existing !== null) result.manifest[rel] = sha256(existing);
    return;
  }

  let content = await readFile(srcPath, "utf8");
  if (destPath.endsWith(".ts") || destPath.endsWith(".tsx")) {
    if (opts.aliasFrom && opts.aliasTo !== undefined) {
      content = content.split(opts.aliasFrom).join(opts.aliasTo);
    }
    for (const { from, to } of opts.extraRewrites ?? []) {
      content = content.split(from).join(to);
    }
  }

  const existing = await readIfExists(destPath);
  const recorded = opts.previous?.[rel];
  const forced = opts.force || opts.forcePaths?.has(rel);
  if (!forced && existing !== null && recorded !== undefined && sha256(existing) !== recorded) {
    result.skipped.push(rel);
    result.manifest[rel] = sha256(existing);
    return;
  }

  const newHash = sha256(content);
  if (existing !== null && sha256(existing) === newHash) {
    result.manifest[rel] = newHash; // already byte-identical — nothing to do
    return;
  }

  result.updated.push(rel);
  result.manifest[rel] = newHash;
  opts.collectDiffs?.push({ path: rel, oldContent: existing, newContent: content });
  if (opts.dryRun) return;

  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, content, "utf8");
}

/** Recursively copies srcDir into destDir, rewriting the placeholder core import alias in .ts files. */
export async function copyDir(srcDir: string, destDir: string, opts: CopyOptions, destRoot: string = destDir, result?: CopyResult): Promise<CopyResult> {
  const acc: CopyResult = result ?? { manifest: {}, skipped: [], ignored: [], updated: [] };
  const skipNames = opts.neverCopy ?? NEVER_COPY;
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (skipNames.has(entry.name)) continue;
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, opts, destRoot, acc);
    } else {
      await copyOneFile(srcPath, destPath, destRoot, opts, acc);
    }
  }

  return acc;
}

/**
 * Removes the directory a pruned file lived in once it is empty, and keeps walking up. Leaving
 * the husk behind is not cosmetic: an empty `prisma/migrations/<name>/` is a migration with no
 * SQL, which the migration tooling rejects.
 */
async function removeEmptyParents(dir: string, stopAt: string): Promise<void> {
  const root = resolve(stopAt);
  let current = resolve(dir);
  while (current.startsWith(root) && current !== root) {
    try {
      await rmdir(current); // fails, harmlessly, as soon as a directory still has contents
    } catch {
      return;
    }
    current = dirname(current);
  }
}

/**
 * Removes files the previous install owned that this one does not — what makes switching
 * variants clean rather than additive, so the emitted project never carries the other variant's
 * leftovers. A file the user has edited since it was installed is kept and reported instead.
 */
export async function pruneRemovedFiles(
  destRoot: string,
  previous: Record<string, string>,
  result: CopyResult,
  opts: { force?: boolean; ignore?: string[]; dryRun?: boolean } = {},
): Promise<{ removed: string[]; keptModified: string[] }> {
  const removed: string[] = [];
  const keptModified: string[] = [];

  for (const [rel, recorded] of Object.entries(previous)) {
    if (rel in result.manifest || opts.ignore?.includes(rel)) continue;

    const existing = await readIfExists(join(destRoot, rel));
    if (existing === null) continue;
    if (!opts.force && sha256(existing) !== recorded) {
      keptModified.push(rel);
      continue;
    }
    if (!opts.dryRun) {
      await rm(join(destRoot, rel), { force: true });
      await removeEmptyParents(dirname(join(destRoot, rel)), destRoot);
    }
    removed.push(rel);
  }

  return { removed, keptModified };
}
