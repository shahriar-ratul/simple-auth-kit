#!/usr/bin/env node
// Warn-only lint: the 4 combos hand-duplicate ability.ts by design (see plan/brief.md decision
// 1 — no shared runtime adapter across combos), so nothing *forces* their exported shape to stay
// in sync. This just flags when one combo's ability.ts has quietly grown a symbol the others
// don't have, which is usually an accident rather than an intentional per-combo difference.
//
// Deliberately a regex pass, not a real TS parser: this only needs top-level export names, and
// a parser dependency is more machinery than a lint that never blocks anything is worth.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMBOS = ["nestjs-prisma", "nestjs-drizzle", "express-prisma", "express-drizzle"];

// Order matters: block comments before line comments, so a `//` inside a `/* … */` block isn't
// left behind as a dangling line comment once the block is stripped.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

const EXPORT_RE = /export\s+(?:const|function|type|interface)\s+([A-Za-z_$][\w$]*)/g;

function exportedSymbols(source) {
  const normalized = stripComments(source).replace(/\s+/g, " ");
  const names = new Set();
  for (const match of normalized.matchAll(EXPORT_RE)) names.add(match[1]);
  return names;
}

const bySources = await Promise.all(
  COMBOS.map(async (combo) => {
    const path = join(REPO_ROOT, "registry/combos", combo, "shared/src/ability.ts");
    const source = await readFile(path, "utf8");
    return [combo, exportedSymbols(source)];
  }),
);

const all = new Set();
for (const [, names] of bySources) for (const name of names) all.add(name);

// A symbol diverges when it isn't exported by every combo — flag it against whichever combos
// are missing it, so the warning points straight at what to add or remove.
let diverged = false;
for (const name of all) {
  const missingFrom = bySources.filter(([, names]) => !names.has(name)).map(([combo]) => combo);
  if (missingFrom.length > 0) {
    diverged = true;
    const presentIn = bySources.filter(([, names]) => names.has(name)).map(([combo]) => combo);
    console.warn(`check-combo-drift: "${name}" exported by [${presentIn.join(", ")}] but missing from [${missingFrom.join(", ")}]`);
  }
}

if (diverged) {
  console.warn("check-combo-drift: ability.ts exports diverge across combos (warn-only, not blocking)");
} else {
  console.log("check-combo-drift: ability.ts exports match across all 4 combos");
}
