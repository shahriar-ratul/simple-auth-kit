import { readdir, readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { sha256 } from "./copy.js";

export interface NativeIdentity {
  /** PascalCase app name baked into the native scaffolding, e.g. "MobileBareRn". */
  name: string;
  /** Reverse-DNS package/bundle id, e.g. "com.mobilebarern". */
  package: string;
}

// Anything under android/ or ios/ with one of these extensions is binary — left untouched by
// the text-content replace pass. Everything else (including extensionless files like Podfile
// and .xcode.env) is read as text.
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".keystore", ".jar", ".zip", ".ttf", ".otf", ".icns", ".car"]);

export function toPascalCase(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((seg) => seg[0].toUpperCase() + seg.slice(1))
    .join("");
}

export const derivePackage = (pascalName: string): string => `com.${pascalName.toLowerCase()}`;

async function walkFilesIfExists(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFilesIfExists(full)));
    else out.push(full);
  }
  return out;
}

async function renameIfExists(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
}

/** Renames every file/directory anywhere under `dir` whose name is exactly `oldName` or starts
 * with `oldName.` (e.g. `MobileBareRn.xcodeproj`, `MobileBareRn.xcscheme`, or the bare
 * `MobileBareRn` source folder) — bottom-up, so a renamed parent doesn't strand its children's
 * still-pending renames. Returns every (oldPath, newPath) pair actually renamed, absolute. */
async function renameMatchingEntries(dir: string, oldName: string, newName: string): Promise<Array<[string, string]>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const renamed: Array<[string, string]> = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      renamed.push(...(await renameMatchingEntries(full, oldName, newName)));
    }
    if (entry.name === oldName || entry.name.startsWith(`${oldName}.`)) {
      const newFull = join(dir, newName + entry.name.slice(oldName.length));
      if (await renameIfExists(full, newFull)) renamed.push([full, newFull]);
    }
  }
  return renamed;
}

/** Replaces oldName/oldPackage with newName/newPackage in a text file's content. Returns the
 * new sha256 if the file was text and its content actually changed, else null (binary, missing,
 * or unchanged — nothing for the caller to update in a hash manifest). */
async function replaceInFile(path: string, oldName: string, newName: string, oldPackage: string, newPackage: string): Promise<string | null> {
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return null; // gone (e.g. inside a dir renamed out from under this listing) — not an error
  }
  const replaced = content.split(oldName).join(newName).split(oldPackage).join(newPackage);
  if (replaced === content) return null;
  await writeFile(path, replaced, "utf8");
  return sha256(replaced);
}

export interface RenameResult {
  /** [oldRelPath, newRelPath] (relative to targetRoot, POSIX) for every path that moved. */
  movedPaths: Array<[string, string]>;
  /** relPath (post-move, POSIX) -> new sha256, for every text file whose content changed. */
  contentHashUpdates: Record<string, string>;
}

/**
 * Re-templates a bare React Native app's baked-in native identity — Android
 * applicationId/package folder, iOS Xcode project/scheme/bundle id — from the registry's
 * placeholder values to a consumer-chosen name. Without this, every app the CLI generates
 * from this combo would collide on the same applicationId/bundle id (the registry's source
 * apps are literally identical on this point — they're never installed side by side).
 * Every occurrence of the old PascalCase name and old package string across every text file
 * under android/ and ios/, plus the RN-specific app.json at the project root, is replaced —
 * mirroring what `react-native rename` tooling does, since the alternative (surgically
 * parsing build.gradle / a semi-structured .pbxproj) is far more fragile for no real benefit.
 *
 * Returns what moved and what changed so the caller (easy-auth.ts) can keep auth.lock.json's
 * manifest in sync with what's actually on disk — otherwise a future re-sync would see every
 * renamed/rewritten native file as "removed" or "user-modified" for no real reason.
 */
export async function renameNative(targetRoot: string, oldIdentity: NativeIdentity, newDisplayName: string): Promise<RenameResult> {
  const newName = toPascalCase(newDisplayName) || oldIdentity.name;
  const newPackage = derivePackage(newName);
  if (newName === oldIdentity.name && newPackage === oldIdentity.package) return { movedPaths: [], contentHashUpdates: {} };

  const androidDir = join(targetRoot, "android");
  const iosDir = join(targetRoot, "ios");
  const movedAbs: Array<[string, string]> = [];

  const oldPkgPath = join(androidDir, "app/src/main/java", ...oldIdentity.package.split("."));
  const newPkgPath = join(androidDir, "app/src/main/java", ...newPackage.split("."));
  if (oldPkgPath !== newPkgPath) {
    await mkdir(dirname(newPkgPath), { recursive: true });
    if (await renameIfExists(oldPkgPath, newPkgPath)) movedAbs.push([oldPkgPath, newPkgPath]);
  }

  movedAbs.push(...(await renameMatchingEntries(iosDir, oldIdentity.name, newName)));

  // Content replace runs after every move, so it operates on final paths only.
  const files = [...(await walkFilesIfExists(androidDir)), ...(await walkFilesIfExists(iosDir)), join(targetRoot, "app.json")];
  const contentHashUpdates: Record<string, string> = {};
  for (const file of files) {
    const newHash = await replaceInFile(file, oldIdentity.name, newName, oldIdentity.package, newPackage);
    if (newHash) contentHashUpdates[relative(targetRoot, file).split("\\").join("/")] = newHash;
  }

  const movedPaths: Array<[string, string]> = movedAbs.map(([from, to]) => [
    relative(targetRoot, from).split("\\").join("/"),
    relative(targetRoot, to).split("\\").join("/"),
  ]);
  return { movedPaths, contentHashUpdates };
}

/** Rewrites a manifest (relPath -> sha256) so keys under any renamed directory/file follow the
 * move, and applies the recomputed hashes for files whose content also changed. */
export function reconcileManifest(manifest: Record<string, string>, result: RenameResult): Record<string, string> {
  if (result.movedPaths.length === 0 && Object.keys(result.contentHashUpdates).length === 0) return manifest;

  // movedPaths is bottom-up (a nested file's own rename lands before its parent directory's
  // rename), so a path can need more than one substitution applied in sequence — e.g. a
  // scheme file renamed inside a still-old-named .xcodeproj, whose .xcodeproj is itself
  // renamed one step later. Chain every applicable move against the progressively-updated
  // path rather than stopping at the first match.
  const next: Record<string, string> = {};
  for (const [rel, hash] of Object.entries(manifest)) {
    let newRel = rel;
    for (const [oldPrefix, newPrefix] of result.movedPaths) {
      if (newRel === oldPrefix) {
        newRel = newPrefix;
      } else if (newRel.startsWith(`${oldPrefix}/`)) {
        newRel = newPrefix + newRel.slice(oldPrefix.length);
      }
    }
    next[newRel] = result.contentHashUpdates[newRel] ?? hash;
  }
  return next;
}
