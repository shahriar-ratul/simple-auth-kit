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
   * The previous install's sha256-by-path manifest. A destination file whose current content
   * no longer matches what was recorded is a file the user edited, and is left alone.
   */
  previous?: Record<string, string>;
  /** Overwrite user-modified files anyway. */
  force?: boolean;
  /** Paths (relative to destRoot, POSIX separators) this install must not write or delete. */
  ignore?: string[];
  /** Overrides the default skip-by-name set (see NEVER_COPY / SCAFFOLD_NEVER_COPY). */
  neverCopy?: Set<string>;
}

export interface CopyResult {
  /** sha256 by path relative to destRoot, for every file this install now owns. */
  manifest: Record<string, string>;
  /** Files left alone because the user had edited them. */
  skipped: string[];
  /** Files left alone because they are on the ignore list. */
  ignored: string[];
}

export const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");
const toPosix = (path: string) => path.split(sep).join("/");

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function copyOneFile(srcPath: string, destPath: string, destRoot: string, opts: CopyOptions, result: CopyResult): Promise<void> {
  const rel = toPosix(relative(destRoot, destPath));

  if (opts.ignore?.includes(rel)) {
    result.ignored.push(rel);
    const existing = await readIfExists(destPath);
    if (existing !== null) result.manifest[rel] = sha256(existing);
    return;
  }

  let content = await readFile(srcPath, "utf8");
  if (opts.aliasFrom && opts.aliasTo !== undefined && (destPath.endsWith(".ts") || destPath.endsWith(".tsx"))) {
    content = content.split(opts.aliasFrom).join(opts.aliasTo);
  }

  const existing = await readIfExists(destPath);
  const recorded = opts.previous?.[rel];
  if (!opts.force && existing !== null && recorded !== undefined && sha256(existing) !== recorded) {
    result.skipped.push(rel);
    result.manifest[rel] = sha256(existing);
    return;
  }

  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, content, "utf8");
  result.manifest[rel] = sha256(content);
}

/** Recursively copies srcDir into destDir, rewriting the placeholder core import alias in .ts files. */
export async function copyDir(srcDir: string, destDir: string, opts: CopyOptions, destRoot: string = destDir, result?: CopyResult): Promise<CopyResult> {
  const acc: CopyResult = result ?? { manifest: {}, skipped: [], ignored: [] };
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
  opts: { force?: boolean; ignore?: string[] } = {},
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
    await rm(join(destRoot, rel), { force: true });
    await removeEmptyParents(dirname(join(destRoot, rel)), destRoot);
    removed.push(rel);
  }

  return { removed, keptModified };
}
