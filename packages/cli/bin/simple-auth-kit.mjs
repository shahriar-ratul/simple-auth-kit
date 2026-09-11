#!/usr/bin/env node
// Thin launcher so `npm link` (or the published @simple-auth-kit/cli via npx) makes
// `simple-auth-kit` a real command — matching shadcn's `npx shadcn add <component>` ergonomics:
// run it from inside any consumer project, no `cd` into this repo, no `--into` needed (it
// already defaults to cwd).
//
// Resolves tsx via Node's own module resolution (require.resolve), not a hardcoded
// "../node_modules/.bin/tsx" relative path — that broke under plain npm/npx installs, which
// hoist tsx to a shared top-level node_modules rather than nesting it inside this package's own
// node_modules (pnpm's per-package node_modules made this invisible in monorepo dev). Reading
// tsx's own package.json "bin" field, rather than hardcoding "dist/cli.mjs", stays correct even
// if tsx's internal file layout changes in a future version.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "simple-auth-kit.ts");

const require = createRequire(import.meta.url);
const tsxPkgJson = require.resolve("tsx/package.json");
const tsxBin = typeof require(tsxPkgJson).bin === "string" ? require(tsxPkgJson).bin : require(tsxPkgJson).bin.tsx;
const tsxCli = join(dirname(tsxPkgJson), tsxBin);

const result = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});
process.exit(result.status ?? 1);
