import { resolve, relative } from "node:path";

const quote = (p) => `"${p}"`;

// The 4 backend combos are real pnpm workspace members — registry/combos/<combo>/ has its own
// node_modules (pnpm installs each workspace member's own deps there), so eslint.config.js at
// the combo root can resolve its own `typescript-eslint` import directly. Invoke the local
// node_modules/.bin/eslint directly rather than `npx eslint` — with a dozen-plus of these tasks
// running in parallel, npx's own resolution/locking becomes real contention (observed hangs and
// spawn failures under load); a direct binary path has none of that overhead.
function comboTask(combo) {
  const dir = resolve(`registry/combos/${combo}`);
  const bin = resolve(dir, "node_modules/.bin/eslint");
  return (files) => {
    const rel = files
      .map((f) => relative(dir, f))
      .map(quote)
      .join(" ");
    return `sh -c 'cd ${dir} && ${bin} --fix ${rel}'`;
  };
}

// Admin/mobile app templates (registry/{admin,mobile}-apps/*) have no node_modules of their own
// next to shared/eslint.config.js — unlike combos, scaffold-mode apps ship a real package.json
// per variant instead of a combo-root one, so there's nothing to `pnpm install` into at the
// registry template path itself. The only installed, runnable copy of that config during
// monorepo dev is the apps/* mirror (kept in sync via `simple-auth-kit update`). A file only
// present under the registry template path (not yet synced into apps/*) is intentionally
// skipped here — the generic Prettier fallback below still formats it.
function appTask(variantDirs) {
  const abs = variantDirs.map((d) => resolve(d));
  return (files) => {
    const commands = [];
    for (const dir of abs) {
      const inThisVariant = files.filter((f) => f.startsWith(dir + "/"));
      if (inThisVariant.length === 0) continue;
      const rel = inThisVariant
        .map((f) => relative(dir, f))
        .map(quote)
        .join(" ");
      const bin = resolve(dir, "node_modules/.bin/eslint");
      commands.push(`sh -c 'cd ${dir} && ${bin} --fix ${rel}'`);
    }
    return commands;
  };
}

export default {
  "registry/combos/nestjs-prisma/{shared,variants}/**/*.ts":
    comboTask("nestjs-prisma"),
  "registry/combos/nestjs-drizzle/{shared,variants}/**/*.ts":
    comboTask("nestjs-drizzle"),
  "registry/combos/express-prisma/{shared,variants}/**/*.ts":
    comboTask("express-prisma"),
  "registry/combos/express-drizzle/{shared,variants}/**/*.ts":
    comboTask("express-drizzle"),

  "{registry/admin-apps/nextjs/**,apps/admin-nextjs/**,apps/admin-nextjs-workspaces/**}/*.{ts,tsx}":
    appTask(["apps/admin-nextjs", "apps/admin-nextjs-workspaces"]),

  "{registry/admin-apps/react/**,apps/admin-react/**,apps/admin-react-workspaces/**}/*.{ts,tsx}":
    appTask(["apps/admin-react", "apps/admin-react-workspaces"]),

  "{registry/mobile-apps/bare-rn/**,apps/mobile-bare-rn/**,apps/mobile-bare-rn-workspaces/**}/*.{ts,tsx,js}":
    appTask(["apps/mobile-bare-rn", "apps/mobile-bare-rn-workspaces"]),

  "{registry/mobile-apps/expo/**,apps/mobile-expo/**,apps/mobile-expo-workspaces/**}/*.{ts,tsx,js}":
    appTask(["apps/mobile-expo", "apps/mobile-expo-workspaces"]),

  // Generic Prettier fallback: every other staged text file, repo-wide. Prettier resolves its
  // own nearest config per file (root's .prettierrc.json, or a closer one like the mobile apps'
  // own shared/.prettierrc.js), so this never fights the eslint tasks above (lint vs format).
  "**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,mdx,yml,yaml,css,scss}": (files) =>
    `prettier --write ${files.map(quote).join(" ")}`,
};
