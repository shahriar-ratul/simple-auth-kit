#!/usr/bin/env node
// Runs at `prepack` (before `npm publish`/`npm pack`): copies the repo's registry/ into
// registry/ here, as a sibling of simple-auth-kit.ts, so the published package is
// self-contained — see the REGISTRY_ROOT comment in simple-auth-kit.ts. Never committed (see
// .gitignore); regenerated fresh every publish, always matching whatever's currently in the
// registry at publish time.
//
// Excludes exactly what the CLI itself never reads out of the registry anyway (dev-only
// tooling, build output) — skipping them keeps the published tarball from ballooning with e.g.
// each combo's own node_modules.
import { cp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(CLI_DIR, "..", "..");
const SRC = join(REPO_ROOT, "registry");
const DEST = join(CLI_DIR, "registry");

const EXCLUDE_NAMES = new Set(["node_modules", ".variant", "dist", "generated", "coverage"]);

await rm(DEST, { recursive: true, force: true });
await cp(SRC, DEST, {
  recursive: true,
  filter: (src) => {
    const base = src.split("/").pop();
    if (EXCLUDE_NAMES.has(base)) return false;
    if (base?.endsWith(".tsbuildinfo")) return false;
    return true;
  },
});

console.log(`bundled ${SRC} -> ${DEST}`);
