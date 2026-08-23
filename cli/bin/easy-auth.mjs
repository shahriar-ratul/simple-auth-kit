#!/usr/bin/env node
// Thin launcher so `npm link` (run once, inside cli/) makes `easy-auth` a real global command —
// matching shadcn's `npx shadcn add <component>` ergonomics: run it from inside any consumer
// project, no `cd` into this repo, no `--into` needed (it already defaults to cwd). Spawns the
// local tsx binary by absolute path so this works regardless of the caller's cwd or global PATH.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsxBin = join(here, "..", "node_modules", ".bin", "tsx");
const entry = join(here, "..", "easy-auth.ts");

const result = spawnSync(tsxBin, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});
process.exit(result.status ?? 1);
