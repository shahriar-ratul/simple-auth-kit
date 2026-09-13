#!/usr/bin/env node
// One-off script: reorganizes a combo's shared/src + variants/<v>/src (and the test files that
// import from them) from a flat file list into role-based subfolders (controllers/, services/,
// repositories/, guards/, filters/, interceptors/, gateways/) — dto/ and core/ already exist as
// folders and are untouched. Run once per combo (idempotent: files already in the right place,
// and imports already correct, are left alone).
//
// Every existing file lives at depth 0 (top-level within its src root) or depth 1 (already in
// dto/). Every renamed file moves to depth 1 (one new subfolder). So the relative-path
// recomputation only ever needs to handle depth-0/depth-1 pairs, both before and after.
//
// Usage: node scripts/reorg-combo-src.mjs <combo-dir>   e.g. registry/combos/nestjs-prisma
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, dirname, relative, basename } from "node:path";
import { execSync } from "node:child_process";

const comboDir = process.argv[2];
if (!comboDir) {
  console.error("usage: node scripts/reorg-combo-src.mjs <combo-dir>");
  process.exit(1);
}

const RULES = [
  // NestJS combos.
  [/\.controller\.ts$/, "controllers"],
  [/\.service\.ts$/, "services"],
  [/\.guard\.ts$/, "guards"],
  [/\.filter\.ts$/, "filters"],
  [/\.interceptor\.ts$/, "interceptors"],
  [/\.gateway\.ts$/, "gateways"],
  // Express combos — Express's own idiom (router, middleware), not NestJS's, per this repo's
  // "framework idiom mapping: same seam, different vocabulary" convention.
  [/\.router\.ts$/, "routers"],
  [/\.middleware\.ts$/, "middleware"],
  // Shared by every combo.
  [/\.repository\.ts$/, "repositories"],
];

function targetFolder(base) {
  for (const [re, folder] of RULES) if (re.test(base)) return folder;
  return null;
}

async function walkTs(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTs(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const srcRoots = [
  join(comboDir, "shared", "src"),
  join(comboDir, "variants", "base", "src"),
  join(comboDir, "variants", "workspaces", "src"),
];
const testRoots = [
  join(comboDir, "test"),
  join(comboDir, "variants", "base", "test"),
  join(comboDir, "variants", "workspaces", "test"),
];

// old basename -> new relative path within its own src root, e.g. "auth.service.ts" -> "services/auth.service.ts"
const renameMap = new Map();
for (const root of srcRoots) {
  const files = await walkTs(root);
  for (const f of files) {
    const rel = relative(root, f);
    if (rel.includes("/")) continue; // already inside dto/ — not part of this reorg
    const folder = targetFolder(rel);
    if (folder) renameMap.set(rel, `${folder}/${rel}`);
  }
}

console.log("Rename map:");
for (const [from, to] of renameMap) console.log(`  ${from} -> ${to}`);

/** New relative-within-src-root dir for a basename that used to live at `oldDir` (dirname of its
 * old relative path): renamed files move per renameMap; everything else (route-tiers.ts, dto/*,
 * etc.) keeps its old dir. */
function newDirFor(oldRelPath) {
  const base = basename(oldRelPath);
  const renamed = renameMap.get(base);
  return renamed ? dirname(renamed) : dirname(oldRelPath);
}

function relSpec(fromDir, toDir, toBase) {
  if (fromDir === toDir) return `./${toBase}`;
  if (fromDir === ".") return `./${toDir}/${toBase}`;
  if (toDir === ".") return `../${toBase}`;
  return `../${toDir}/${toBase}`;
}

/** Rewrites one src file's relative imports. `oldRel`/`newRel` are this file's own relative path
 * (within its src root) before/after the move. */
function rewriteSrcImports(content, oldRel) {
  const oldOwnDir = dirname(oldRel);
  const newOwnDir = newDirFor(oldRel);
  const resolve = (spec) => {
    // Resolve `spec` against this file's OLD dir to get the target's OLD relative-to-src-root path.
    const oldTargetRel = relative(".", join(oldOwnDir, spec)).replace(
      /\.js$/,
      ".ts",
    );
    const targetBase = basename(oldTargetRel);
    const newTargetDir = newDirFor(oldTargetRel);
    return relSpec(newOwnDir, newTargetDir, targetBase.replace(/\.ts$/, ".js"));
  };
  return (
    content
      // `import ... from "./x.js"` / `export ... from "./x.js"` (including `import type`).
      .replace(
        /from\s+"(\.[^"]+)"/g,
        (whole, spec) => `from "${resolve(spec)}"`,
      )
      // Bare side-effect imports: `import "./x.js";` (no `from`).
      .replace(
        /^import\s+"(\.[^"]+)"/gm,
        (whole, spec) => `import "${resolve(spec)}"`,
      )
  );
}

/** Test files import via "../src/x.js" or "../src/dto/x.js" etc — only ../src/* specifiers can
 * reference a moved file, and they're always relative to "." (test files themselves don't move). */
function rewriteTestImports(content) {
  return content.replace(/from\s+"(\.\.\/src\/[^"]+)"/g, (whole, spec) => {
    const oldTargetRel = spec
      .replace(/^\.\.\/src\//, "")
      .replace(/\.js$/, ".ts");
    const targetBase = basename(oldTargetRel);
    const newTargetDir = newDirFor(oldTargetRel);
    const newTargetRel =
      newTargetDir === "." ? targetBase : `${newTargetDir}/${targetBase}`;
    return `from "../src/${newTargetRel.replace(/\.ts$/, ".js")}"`;
  });
}

// 1. Rewrite imports in every src file, keyed by each file's OWN old relative path.
for (const root of srcRoots) {
  const files = await walkTs(root);
  for (const f of files) {
    const oldRel = relative(root, f);
    const content = await readFile(f, "utf8");
    const updated = rewriteSrcImports(content, oldRel);
    if (updated !== content) await writeFile(f, updated, "utf8");
  }
}

// 2. Rewrite test files' imports.
for (const root of testRoots) {
  const files = await walkTs(root);
  for (const f of files) {
    const content = await readFile(f, "utf8");
    const updated = rewriteTestImports(content);
    if (updated !== content) await writeFile(f, updated, "utf8");
  }
}

// 3. Move the files (git mv, so history follows) — only within roots that actually have that
// basename present at top level.
for (const root of srcRoots) {
  for (const [from, to] of renameMap) {
    const fromPath = join(root, from);
    const toPath = join(root, to);
    try {
      await access(fromPath);
    } catch {
      continue;
    }
    await mkdir(dirname(toPath), { recursive: true });
    execSync(`git mv ${JSON.stringify(fromPath)} ${JSON.stringify(toPath)}`, {
      stdio: "inherit",
    });
  }
}

console.log("Done.");
