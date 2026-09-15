#!/usr/bin/env node
// Published as @simple-auth-kit/cli — `npx @simple-auth-kit/cli add nestjs-prisma --into .` to
// merge into the project you're standing in. Also runnable straight from a monorepo checkout:
// `pnpm --filter @simple-auth-kit/cli run cli -- add nestjs-prisma --into ../my-app`.
//
// A combo ships in variants (see registry/README.md). `add <combo>` emits the default one;
// `add <combo> --workspaces` emits the workspace variant, composed by copying the combo's
// `shared/` directory and then `variants/<variant>/` over the top.
//
// Combos also carry a `kind` ("api" | "admin" | "mobile", defaults to "api" when absent) and an
// `installMode` ("merge" | "scaffold", defaults to "merge" for api / "scaffold" otherwise). "api"
// combos merge a source fragment into a project; "admin"/"mobile" combos scaffold a whole
// standalone app, package.json and all. Both write into --into when given (an existing project),
// but without --into neither kind touches the bare cwd — every install nests one level down into
// a new folder named for --name or the combo itself, so `add <combo>` alone always starts a fresh
// project rather than dropping files into whatever directory you happened to run it from. `add`
// with no combo positional launches a guided, shadcn-CLI-style prompt flow (via `prompts`) asking
// which kind(s) to generate, which framework per kind, and whether to include workspaces support
// — or reads the same choices from --kind/--framework/--workspaces for non-interactive/scripted
// use.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTwoFilesPatch } from "diff";
import prompts from "prompts";
import {
  copyDir,
  copyOneFile,
  CopyOptions,
  CopyResult,
  DiffEntry,
  NEVER_COPY,
  pruneRemovedFiles,
  SCAFFOLD_NEVER_COPY,
  sha256,
} from "./lib/copy.js";
import {
  reconcileManifest,
  renameNative,
  type NativeIdentity,
} from "./lib/rename-native.js";

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
// Two contexts, and they disagree about where the registry is:
//  - published package: registry/ is bundled as a sibling of this file (see
//    scripts/bundle-registry.mjs, run at `prepack` time — it's never committed to git, only
//    materialized right before `npm publish`/`npm pack`).
//  - monorepo dev checkout: this file lives at packages/cli/, so the real registry/ is two
//    levels up, at the repo root.
const REGISTRY_ROOT = existsSync(join(CLI_DIR, "registry"))
  ? join(CLI_DIR, "registry")
  : resolve(CLI_DIR, "..", "..", "registry");
const CONFIG_FILENAME = ".simple-auth-kit.json";
const DEFAULT_VARIANT = "base";

type Kind = "api" | "admin" | "mobile";
type InstallMode = "merge" | "scaffold";

const KIND_LABELS: Record<Kind, string> = {
  api: "API (backend)",
  admin: "Admin console",
  mobile: "Mobile app",
};
const KIND_FRAMEWORK_NOUN: Record<Kind, string> = {
  api: "API stack",
  admin: "admin framework",
  mobile: "mobile framework",
};

/** Flags that take no value. Everything else consumes the next argv entry. */
const BOOLEAN_FLAGS = new Set([
  "workspaces",
  "force",
  "check",
  "config-only",
  "skip-install",
  "help",
]);

interface SimpleAuthKitConfig {
  path: string;
  alias: string;
  /** Paths (relative to the install directory) the CLI must never write or delete. */
  ignore: string[];
}

interface ComboEntry {
  dir: string;
  sharedDir?: string;
  variantsDir?: string;
  variants: string[];
  peerDependencies: string[];
  postInstall: string[];
  variantPostInstall?: Record<string, string[]>;
  /** Defaults to "api" — every combo predating this field is an api combo. */
  kind?: Kind;
  /** Defaults to "merge" for kind "api", "scaffold" otherwise. */
  installMode?: InstallMode;
  /** Present only for combos (bare React Native) whose native android/ios scaffolding bakes
   * in a placeholder app identity that must be re-templated per generated app — see
   * lib/rename-native.ts. Absent for every other combo (nothing to rename). */
  nativeIdentity?: NativeIdentity;
}

interface Registry {
  core: { dir: string; peerDependencies: string[] };
  variants: Record<string, { flag: string | null; description: string }>;
  combos: Record<string, ComboEntry>;
}

interface AuthLock {
  combo?: string;
  variant?: string;
  installedAt?: string;
  files?: Record<string, string>;
}

const DEFAULT_CONFIG: SimpleAuthKitConfig = {
  path: "src",
  alias: "@",
  ignore: [],
};

const comboKind = (combo: ComboEntry): Kind => combo.kind ?? "api";
const comboInstallMode = (combo: ComboEntry): InstallMode =>
  combo.installMode ?? (comboKind(combo) === "api" ? "merge" : "scaffold");

function parseArgs(argv: string[]): {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
} {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        flags[name] = rest[i + 1];
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

const flagString = (value: string | true | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;
const flagList = (value: string | true | undefined): string[] | undefined =>
  typeof value === "string"
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

async function loadRegistry(): Promise<Registry> {
  return JSON.parse(await readFile(join(CLI_DIR, "registry.json"), "utf8"));
}

async function loadConfig(targetRoot: string): Promise<SimpleAuthKitConfig> {
  try {
    const raw = await readFile(join(targetRoot, CONFIG_FILENAME), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadLock(targetRoot: string): Promise<AuthLock> {
  try {
    return JSON.parse(
      await readFile(join(targetRoot, "auth.lock.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** True if `dir` doesn't exist yet, or exists and has nothing in it (dotfiles like `.git`
 * excepted — a repo you've already `git init`'d shouldn't count as "occupied"). */
async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.every((name) => name.startsWith("."));
  } catch {
    return true; // doesn't exist — mkdir'd on demand by the copy, nothing in the way
  }
}

/**
 * In an interactive session, with neither `--force` nor `--check`: runs `runDry` (expected to be
 * a dry-run copy pass — nothing written) to find files that would otherwise be silently skipped
 * as locally modified, and lets the user pick which of those — if any — to overwrite anyway.
 * shadcn-CLI-style "this file already exists, overwrite?", asked once as a multi-select rather
 * than one prompt per file. Falls through to the existing non-interactive behavior (silent skip,
 * reported at the end by printInstallSummary) outside a TTY or under --check, since there's
 * nothing useful to prompt into either case.
 */
async function resolveForcePaths(
  runDry: () => Promise<{ result: CopyResult }>,
  flags: Record<string, string | true>,
): Promise<Set<string>> {
  if (flags.force === true || flags.check === true || !isTTY())
    return new Set();

  const { result } = await runDry();
  if (!result.skipped.length) return new Set();

  console.log(
    `\n${result.skipped.length} file(s) have changed locally since the last install:`,
  );
  const picked = await ask<string[]>({
    type: "multiselect",
    name: "paths",
    message:
      "Overwrite any of these with the latest version? (unselected ones are left alone)",
    choices: result.skipped.map((file) => ({
      title: file,
      value: file,
      selected: false,
    })),
    instructions: false,
  });
  return new Set(picked ?? []);
}

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** Detected from whichever lockfile is already sitting in targetRoot — unambiguous, so used
 * without asking. Returns null when nothing on disk says which tool to use and `--pm` wasn't
 * given either, leaving it to the caller to ask (interactive) or default (non-interactive). */
function detectPackageManagerFromLockfile(
  targetRoot: string,
): PackageManager | null {
  if (existsSync(join(targetRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(targetRoot, "yarn.lock"))) return "yarn";
  if (
    existsSync(join(targetRoot, "bun.lockb")) ||
    existsSync(join(targetRoot, "bun.lock"))
  )
    return "bun";
  if (existsSync(join(targetRoot, "package-lock.json"))) return "npm";
  return null;
}

/** `--pm` wins outright. Otherwise: a lockfile already in targetRoot is unambiguous, so it's used
 * silently. Only when neither says anything — most commonly a scaffold install into an empty
 * directory — and this is a real terminal do we ask; a non-interactive run in that same situation
 * still falls back to npm rather than blocking. */
async function resolvePackageManager(
  targetRoot: string,
  flags: Record<string, string | true>,
): Promise<PackageManager> {
  const requested = flagString(flags.pm);
  if (requested) {
    if ((PACKAGE_MANAGERS as readonly string[]).includes(requested))
      return requested as PackageManager;
    console.error(
      `--pm "${requested}" isn't one of ${PACKAGE_MANAGERS.join(", ")} — falling back to auto-detection.`,
    );
  }

  const detected = detectPackageManagerFromLockfile(targetRoot);
  if (detected) return detected;

  if (isTTY()) {
    const picked = await ask<PackageManager>({
      type: "select",
      name: "pm",
      message: "Which package manager?",
      choices: PACKAGE_MANAGERS.map((value) => ({ title: value, value })),
      initial: 0,
    });
    if (picked) return picked;
  }
  return "npm";
}

/**
 * Actually runs the dependency install, shadcn-`add`-style, instead of just printing the
 * command and leaving it to the consumer. `deps` empty means "just install whatever's in
 * package.json" (the scaffold-mode case — dependencies are already declared, nothing to name).
 * Skipped entirely under `--skip-install`, or when `deps` is non-empty but there's nothing new
 * to add (an update that touched no files has nothing worth re-installing for). `--pm
 * <npm|pnpm|yarn|bun>` picks the tool explicitly instead of auto-detecting/asking.
 */
async function installDependencies(
  targetRoot: string,
  deps: string[],
  flags: Record<string, string | true>,
): Promise<void> {
  if (flags["skip-install"] === true) return;

  const pm = await resolvePackageManager(targetRoot, flags);
  // "install everything in package.json" (zero deps named) is the same bare verb across all
  // four; naming specific packages is "install <pkgs>" for npm, "add <pkgs>" for the others.
  const args = deps.length
    ? [pm === "npm" ? "install" : "add", ...deps]
    : ["install"];

  console.log(`\nInstalling dependencies (${pm})...`);
  let result = spawnSync(pm, args, { cwd: targetRoot, stdio: "inherit" });
  if (result.status !== 0 && pm === "pnpm") {
    // pnpm's default security posture blocks postinstall/preinstall scripts from any dependency
    // it hasn't seen approved before — argon2 (native addon build) and prisma (downloads its
    // query-engine binary) both need theirs to run, so this is the single most common reason a
    // combo install fails under pnpm specifically (ERR_PNPM_IGNORED_BUILDS). It can also recur on
    // a later `update` (a version bump re-flags a build), so approve unconditionally and retry
    // once rather than just telling the consumer to do it by hand each time — `approve-builds
    // --all` is a no-op when nothing is pending.
    console.log(
      `\n${pm} blocked some install scripts — running "pnpm approve-builds --all" and retrying...`,
    );
    spawnSync(pm, ["approve-builds", "--all"], {
      cwd: targetRoot,
      stdio: "inherit",
    });
    result = spawnSync(pm, args, { cwd: targetRoot, stdio: "inherit" });
  }
  if (result.status !== 0) {
    console.error(
      `\n${pm} install exited with an error — run it yourself: cd ${targetRoot} && ${pm} ${args.join(" ")}`,
    );
  }
}

/**
 * The fresh-setup entry point: writes .simple-auth-kit.json (so merge-mode combos have an
 * install path/alias to anchor to), then launches the same guided "what do you need"
 * kind/framework/workspaces flow as bare `add` (interactive prompts, or --kind/--framework for
 * non-interactive/scripted use) to actually install something — matching how `shadcn init` is
 * the fresh-project entry point, not just a config file. Pass --config-only to get the old
 * behavior back (write the config and stop there, no install).
 */
async function cmdInit(
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const config: SimpleAuthKitConfig = {
    path: flagString(flags.path) ?? DEFAULT_CONFIG.path,
    alias: flagString(flags.alias) ?? DEFAULT_CONFIG.alias,
    ignore: [],
  };
  await writeFile(
    join(targetRoot, CONFIG_FILENAME),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
  console.log(
    `Wrote ${CONFIG_FILENAME} — combos will install into ${config.path} (import alias ${config.alias})`,
  );

  if (flags["config-only"] === true) return;

  console.log("");
  await cmdCreate(targetRoot, flags);
}

function resolveVariant(
  combo: ComboEntry,
  comboName: string,
  requested: string,
): string | null {
  if (combo.variants.length === 0) {
    console.error(
      `Combo "${comboName}" has not been migrated to the variant layout yet (see registry/README.md) — nothing to install.`,
    );
    return null;
  }
  if (!combo.variants.includes(requested)) {
    console.error(
      `Combo "${comboName}" has no "${requested}" variant. Available: ${combo.variants.join(", ")}`,
    );
    return null;
  }
  return requested;
}

function requestedVariant(flags: Record<string, string | true>): string {
  return flags.workspaces === true
    ? "workspaces"
    : (flagString(flags.variant) ?? DEFAULT_VARIANT);
}

function printInstallSummary(
  result: CopyResult,
  pruned: { removed: string[]; keptModified: string[] },
) {
  if (result.updated.length) {
    console.log(`\nUpdated (new or changed since last install):`);
    for (const file of result.updated) console.log(`  ${file}`);
  }
  if (result.skipped.length) {
    console.log(
      `\nLeft alone — modified since the last install (re-run with --force to overwrite):`,
    );
    for (const file of result.skipped) console.log(`  ${file}`);
  }
  if (result.ignored.length) {
    console.log(`\nLeft alone — on the ignore list in ${CONFIG_FILENAME}:`);
    for (const file of result.ignored) console.log(`  ${file}`);
  }
  if (pruned.removed.length) {
    console.log(`\nRemoved — no longer part of this install:`);
    for (const file of pruned.removed) console.log(`  ${file}`);
  }
  if (pruned.keptModified.length) {
    console.log(
      `\nNo longer part of this install, but modified locally, so kept (delete by hand if you don't want them):`,
    );
    for (const file of pruned.keptModified) console.log(`  ${file}`);
  }
}

function printPostInstallNotes(combo: ComboEntry, variant: string) {
  const notes = [
    ...combo.postInstall,
    ...(combo.variantPostInstall?.[variant] ?? []),
  ];
  if (notes.length) {
    console.log(`\nNext steps:`);
    for (const note of notes) console.log(`  - ${note}`);
  }
}

/** An ORM combo's config file (shared/) + data directory (variants/<variant>/, always named
 * `database/` — schema/migrations, plus Prisma's generated client under database/generated/ and
 * the seeder at database/seed.ts) that must land at the *project root* instead of merging into
 * destRoot with everything else — each ORM's own tool (`npx prisma ...`, `npx drizzle-kit ...`)
 * looks for its config there by default, no `cd` needed.
 *
 * The registry source never imports database/-relative paths directly — every such reference
 * (the generated Prisma client, Drizzle's schema.ts) goes through the fixed `@/database/*` alias
 * instead, which the consumer adds to their tsconfig `paths` once (see postInstall) pointing at
 * `./database/*` — the CLI never writes tsconfig itself, same as the merged source's own core
 * alias (see `aliasFrom`/`aliasTo` below). Because database/ always lands at the project root
 * regardless of how deep the importing file sits (unlike the core alias, whose target depth
 * actually varies with `--path`), that one fixed alias is stable across installs and needs no
 * per-file import rewriting on the way in. */
const ORM_LAYOUTS: {
  configFile: string;
  dataDir: string;
}[] = [
  { configFile: "prisma.config.ts", dataDir: "database" },
  { configFile: "drizzle.config.ts", dataDir: "database" },
];

interface MergePlan {
  destRoot: string;
  installPath: string;
  alias: string;
  sharedDir: string;
  variantDir: string;
  orm: (typeof ORM_LAYOUTS)[number] | null;
  skipFromShared: Set<string>;
  skipFromVariant: Set<string>;
  config: SimpleAuthKitConfig;
  previous: Record<string, string>;
}

/** Everything about a merge-mode install that doesn't depend on force/dryRun/forcePaths —
 * computed once, shared by installMerge's real run and cmdDiff's read-only one. */
async function buildMergePlan(
  combo: ComboEntry,
  variant: string,
  targetRoot: string,
  flags: Record<string, string | true>,
  previous: Record<string, string>,
): Promise<MergePlan> {
  const config = await loadConfig(targetRoot);
  const installPath = flagString(flags.path) ?? config.path;
  const alias = flagString(flags.alias) ?? config.alias;
  const destRoot = resolve(targetRoot, installPath);

  const comboDir = join(REGISTRY_ROOT, combo.dir);
  const sharedDir = join(comboDir, combo.sharedDir ?? "shared");
  const variantDir = join(comboDir, combo.variantsDir ?? "variants", variant);

  const orm = await (async () => {
    for (const layout of ORM_LAYOUTS) {
      if (await pathExists(join(sharedDir, layout.configFile))) return layout;
    }
    return null;
  })();
  const skipFromShared = orm
    ? new Set([...NEVER_COPY, orm.configFile, "root"])
    : new Set([...NEVER_COPY, "root"]);
  const skipFromVariant = orm
    ? new Set([...NEVER_COPY, orm.dataDir, "root"])
    : new Set([...NEVER_COPY, "root"]);

  return {
    destRoot,
    installPath,
    alias,
    sharedDir,
    variantDir,
    orm,
    skipFromShared,
    skipFromVariant,
    config,
    previous,
  };
}

/** The actual copy pass for a merge-mode install — shared by installMerge (writes for real, or
 * dry-runs for --check/the interactive-prompt pre-check) and cmdDiff (always a dry run, always
 * force:true so a locally-modified file's difference is captured too instead of silently
 * skipped). One exception to "everything merges into destRoot": an ORM combo's config file and
 * data directory (see ORM_LAYOUTS) land at the *project root* instead — e.g. the Prisma combos'
 * `prisma.config.ts` + `database/`, or the Drizzle combos' `drizzle.config.ts` + `database/`.
 *
 * Both are still copied with destRoot (not targetRoot) as the manifest-key root, which makes
 * copyOneFile compute "../"-relative keys for them — deliberate, not an oversight: those keys
 * can never collide with a real destRoot-relative key, so pruneRemovedFiles below correctly
 * removes an ORM folder a pre-migration install left nested inside destRoot, without disturbing
 * anything else's keys. */
async function runMergeCopy(
  plan: MergePlan,
  registry: Registry,
  targetRoot: string,
  opts: {
    force: boolean;
    forcePaths: Set<string>;
    dryRun: boolean;
    collectDiffs?: DiffEntry[];
  },
): Promise<{
  result: CopyResult;
  pruned: { removed: string[]; keptModified: string[] };
}> {
  const result: CopyResult = {
    manifest: {},
    skipped: [],
    ignored: [],
    updated: [],
  };
  const copyOpts: CopyOptions = {
    aliasFrom: "@/lib/auth/core",
    aliasTo: `${plan.alias}/core`,
    previous: plan.previous,
    force: opts.force,
    forcePaths: opts.forcePaths,
    ignore: plan.config.ignore,
    neverCopy: NEVER_COPY,
    dryRun: opts.dryRun,
    collectDiffs: opts.collectDiffs,
  };

  await copyDir(
    join(REGISTRY_ROOT, registry.core.dir),
    join(plan.destRoot, "core"),
    copyOpts,
    plan.destRoot,
    result,
  );

  // shared/src/ and variants/<variant>/src/ are the registry's own internal source layout
  // (parallel to core/, prisma.config.ts, etc.) — copied flat into destRoot rather than
  // preserving that extra "src" level, so a consumer who installed at the default "src"
  // doesn't end up with a redundant "src/src/...". Order matters:
  // shared fully applied (its own src/, then everything else in shared/), then the variant
  // overlaid the same way, so a variant file with the same name still wins.
  const skipShared = new Set([...plan.skipFromShared, "src"]);
  const skipVariant = new Set([...plan.skipFromVariant, "src"]);
  if (await pathExists(join(plan.sharedDir, "src"))) {
    await copyDir(
      join(plan.sharedDir, "src"),
      plan.destRoot,
      { ...copyOpts, neverCopy: plan.skipFromShared },
      plan.destRoot,
      result,
    );
  }
  await copyDir(
    plan.sharedDir,
    plan.destRoot,
    { ...copyOpts, neverCopy: skipShared },
    plan.destRoot,
    result,
  );
  if (await pathExists(join(plan.variantDir, "src"))) {
    await copyDir(
      join(plan.variantDir, "src"),
      plan.destRoot,
      { ...copyOpts, neverCopy: plan.skipFromVariant },
      plan.destRoot,
      result,
    );
  }
  await copyDir(
    plan.variantDir,
    plan.destRoot,
    { ...copyOpts, neverCopy: skipVariant },
    plan.destRoot,
    result,
  );

  if (plan.orm) {
    await copyOneFile(
      join(plan.sharedDir, plan.orm.configFile),
      join(targetRoot, plan.orm.configFile),
      plan.destRoot,
      copyOpts,
      result,
    );
    await copyDir(
      join(plan.variantDir, plan.orm.dataDir),
      join(targetRoot, plan.orm.dataDir),
      copyOpts,
      plan.destRoot,
      result,
    );
  }

  // shared/root/ and variants/<variant>/root/ hold project-root scaffolding (package.json,
  // nest-cli.json, tsconfig.build.json, lint/format/commit config, docker-compose.yml) — real
  // consumer-facing content, not this library's own source, so (like prisma.config.ts/database/
  // above) it's written at targetRoot directly rather than under destRoot ("src" by default).
  // SCAFFOLD_NEVER_COPY (not NEVER_COPY) is used here on purpose: package.json/tsconfig.json are
  // exactly what belongs in this folder, so they must not be filtered out the way they are for
  // the library-source copy above.
  if (await pathExists(join(plan.sharedDir, "root"))) {
    await copyDir(
      join(plan.sharedDir, "root"),
      targetRoot,
      { ...copyOpts, neverCopy: SCAFFOLD_NEVER_COPY },
      plan.destRoot,
      result,
    );
  }
  if (await pathExists(join(plan.variantDir, "root"))) {
    await copyDir(
      join(plan.variantDir, "root"),
      targetRoot,
      { ...copyOpts, neverCopy: SCAFFOLD_NEVER_COPY },
      plan.destRoot,
      result,
    );
  }

  // Switching variants has to remove the old variant's files, or the project ends up with both wired in.
  const pruned = await pruneRemovedFiles(plan.destRoot, plan.previous, result, {
    force: opts.force,
    ignore: plan.config.ignore,
    dryRun: opts.dryRun,
  });
  return { result, pruned };
}

async function installMerge(
  comboName: string,
  combo: ComboEntry,
  variant: string,
  registry: Registry,
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const lock = await loadLock(targetRoot);
  const previous = lock.files ?? {};
  const force = flags.force === true;
  const checkOnly = flags.check === true;

  const plan = await buildMergePlan(
    combo,
    variant,
    targetRoot,
    flags,
    previous,
  );

  if (checkOnly) {
    const { result, pruned } = await runMergeCopy(plan, registry, targetRoot, {
      force,
      forcePaths: new Set(),
      dryRun: true,
    });
    console.log(
      `\nCheck only — nothing written. "${comboName}" (${variant} variant) in ${plan.installPath} (alias ${plan.alias}):`,
    );
    printInstallSummary(result, pruned);
    const silent =
      !result.updated.length &&
      !result.skipped.length &&
      !pruned.removed.length &&
      !pruned.keptModified.length;
    if (silent) console.log(`\nUp to date — nothing would change.`);
    return;
  }

  // Interactive + no --force: find locally-modified conflicts first (a dry run, nothing written),
  // and let the user pick which — if any — to overwrite anyway, shadcn-"this file already exists"
  // style, instead of the non-interactive default of silently leaving all of them alone.
  const forcePaths = await resolveForcePaths(
    () =>
      runMergeCopy(plan, registry, targetRoot, {
        force: false,
        forcePaths: new Set(),
        dryRun: true,
      }),
    flags,
  );
  const { result, pruned } = await runMergeCopy(plan, registry, targetRoot, {
    force,
    forcePaths,
    dryRun: false,
  });

  await writeFile(
    join(targetRoot, "auth.lock.json"),
    JSON.stringify(
      {
        ...lock,
        combo: comboName,
        variant,
        installedAt: new Date().toISOString(),
        files: result.manifest,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    `\nInstalled "${comboName}" (${variant} variant) into ${plan.installPath} (alias ${plan.alias})`,
  );
  printInstallSummary(result, pruned);

  const peerDeps = [
    ...new Set([...registry.core.peerDependencies, ...combo.peerDependencies]),
  ];
  console.log(`\nPeer dependencies: ${peerDeps.join(" ")}`);
  if (result.updated.length) {
    await installDependencies(targetRoot, peerDeps, flags);
  } else if (flags["skip-install"] !== true) {
    console.log(`(nothing changed this run — skipping install)`);
  }
  printPostInstallNotes(combo, variant);
}

/** "scaffold" install — admin/mobile apps materialized as a whole standalone project directly
 * into targetRoot: no core layer, no alias rewrite, package.json is real content (copied and
 * name/description-templated), not the registry's own dev wiring. */
async function installScaffold(
  comboName: string,
  combo: ComboEntry,
  variant: string,
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const lock = await loadLock(targetRoot);
  const previous = lock.files ?? {};
  const force = flags.force === true;

  // Only enforced on a genuinely fresh install (no auth.lock.json yet) — re-running this on an
  // already-scaffolded app (an update) is expected and that directory is obviously non-empty.
  const isFreshInstall = !lock.combo;
  if (isFreshInstall && !force && !(await isEmptyDir(targetRoot))) {
    console.error(
      `${targetRoot} is not empty — "${comboName}" is a scaffold-mode combo (writes a whole new standalone project: package.json, src/, everything) and needs an empty directory. Use a different --into, empty it first, or pass --force to install into it anyway.`,
    );
    process.exitCode = 1;
    return;
  }

  const comboDir = join(REGISTRY_ROOT, combo.dir);

  const runCopy = async (opts: {
    force: boolean;
    forcePaths: Set<string>;
    dryRun: boolean;
  }) => {
    const result: CopyResult = {
      manifest: {},
      skipped: [],
      ignored: [],
      updated: [],
    };
    const copyOpts = {
      previous,
      force: opts.force,
      forcePaths: opts.forcePaths,
      neverCopy: SCAFFOLD_NEVER_COPY,
      dryRun: opts.dryRun,
    };
    await copyDir(
      join(comboDir, combo.sharedDir ?? "shared"),
      targetRoot,
      copyOpts,
      targetRoot,
      result,
    );
    await copyDir(
      join(comboDir, combo.variantsDir ?? "variants", variant),
      targetRoot,
      copyOpts,
      targetRoot,
      result,
    );
    const pruned = await pruneRemovedFiles(targetRoot, previous, result, {
      force: opts.force,
      dryRun: opts.dryRun,
    });
    return { result, pruned };
  };

  // Same shadcn-style "this file already exists, overwrite?" prompt as installMerge — see
  // resolveForcePaths. A no-op dry run on a genuinely fresh install (nothing to conflict with).
  const forcePaths = await resolveForcePaths(
    () => runCopy({ force: false, forcePaths: new Set(), dryRun: true }),
    flags,
  );
  const { result, pruned } = await runCopy({
    force,
    forcePaths,
    dryRun: false,
  });

  const appName = flagString(flags.name) ?? basename(targetRoot);

  if (combo.nativeIdentity) {
    const renamed = await renameNative(
      targetRoot,
      combo.nativeIdentity,
      appName,
    );
    result.manifest = reconcileManifest(result.manifest, renamed);
  }

  const pkgPath = join(targetRoot, "package.json");
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.name = appName;
    pkg.description = `Generated by simple-auth-kit (${comboName}, ${variant} variant).`;
    const content = JSON.stringify(pkg, null, 2) + "\n";
    await writeFile(pkgPath, content, "utf8");
    result.manifest["package.json"] = sha256(content); // keep the manifest honest post-template
  } catch {
    // No package.json in this combo's template — nothing to name.
  }

  await writeFile(
    join(targetRoot, "auth.lock.json"),
    JSON.stringify(
      {
        ...lock,
        combo: comboName,
        variant,
        installedAt: new Date().toISOString(),
        files: result.manifest,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    `\nGenerated "${appName}" (${comboName}, ${variant} variant) into ${targetRoot}`,
  );
  printInstallSummary(result, pruned);
  if (result.updated.length) {
    // Dependencies are already declared in package.json — no specific packages to name, just
    // "install whatever's there" (installDependencies with an empty list does exactly that).
    await installDependencies(targetRoot, [], flags);
  } else if (flags["skip-install"] !== true) {
    console.log(`\n(nothing changed this run — skipping install)`);
  }
  printPostInstallNotes(combo, variant);
}

/** Landing directly in targetRoot when the caller never named a destination means dumping
 * whatever this install writes — a merge-mode fragment's core/src files and project-root
 * scaffolding, or a scaffold-mode app's whole package.json/src/ tree — into whatever directory
 * the command happened to be run from. When --into was passed explicitly, that's trusted as the
 * exact destination (e.g. `--into ./admin`, `--into .`, or the `examples/` resync workflow) —
 * same as always, for every kind. Only the unnamed default (bare cwd) gets nested one level, into
 * a new folder named for --name or the combo itself, so every install — api, admin, or mobile —
 * always starts in a new folder rather than the same one you ran it from. */
function resolveInstallRoot(
  comboName: string,
  combo: ComboEntry,
  targetRoot: string,
  flags: Record<string, string | true>,
): string {
  if (flagString(flags.into)) return targetRoot;
  return join(targetRoot, flagString(flags.name) ?? comboName);
}

async function installCombo(
  comboName: string,
  combo: ComboEntry,
  variant: string,
  registry: Registry,
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  if (comboInstallMode(combo) === "scaffold") {
    await installScaffold(comboName, combo, variant, targetRoot, flags);
  } else {
    await installMerge(comboName, combo, variant, registry, targetRoot, flags);
  }
}

async function cmdAdd(
  comboName: string,
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const registry = await loadRegistry();
  const combo = registry.combos[comboName];
  if (!combo) {
    console.error(
      `Unknown combo "${comboName}". Available: ${Object.keys(registry.combos).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const variant = resolveVariant(combo, comboName, requestedVariant(flags));
  if (!variant) {
    process.exitCode = 1;
    return;
  }

  const installRoot = resolveInstallRoot(comboName, combo, targetRoot, flags);
  if (installRoot !== targetRoot) await mkdir(installRoot, { recursive: true });
  await installCombo(comboName, combo, variant, registry, installRoot, flags);
}

function combosByKind(
  registry: Registry,
  kind: Kind,
): Array<[string, ComboEntry]> {
  return Object.entries(registry.combos).filter(
    ([, combo]) => comboKind(combo) === kind,
  );
}

const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Wraps a single `prompts()` call so a cancel (Ctrl+C) surfaces as `null` instead of `undefined`,
 * which prompts itself doesn't distinguish from "field asked but left empty". */
async function ask<T>(
  question: Parameters<typeof prompts>[0] & { name: string },
): Promise<T | null> {
  const res = await prompts(question as never);
  const value = (res as Record<string, unknown>)[question.name as string];
  return value === undefined ? null : (value as T);
}

/**
 * Resolves what to generate this run — from --kind/--framework/--workspaces flags where given,
 * prompting (shadcn-CLI-style) for whatever's missing when stdin/stdout are a TTY. One workspaces
 * choice applies to every kind picked this run, matching how `variants` is already a single
 * cross-cutting concept rather than per-combo.
 */
async function resolvePlan(
  registry: Registry,
  flags: Record<string, string | true>,
): Promise<Array<{
  comboName: string;
  combo: ComboEntry;
  variant: string;
}> | null> {
  const flagKinds = flagList(flags.kind) as Kind[] | undefined;
  const flagFrameworks = flagList(flags.framework);
  const interactive = isTTY();

  let kinds: Kind[];
  if (flagKinds?.length) {
    kinds = flagKinds;
  } else if (interactive) {
    const picked = await ask<Kind[]>({
      type: "multiselect",
      name: "kinds",
      message: "What would you like to generate?",
      choices: (Object.keys(KIND_LABELS) as Kind[]).map((value) => ({
        title: KIND_LABELS[value],
        value,
      })),
      min: 1,
      instructions: false,
    });
    if (!picked || picked.length === 0) {
      console.log("Cancelled.");
      return null;
    }
    kinds = picked;
  } else {
    console.error(
      "Non-interactive session: pass --kind api,admin,mobile (comma-separated), or a specific combo name (simple-auth-kit add <combo>).",
    );
    return null;
  }

  if (interactive) {
    console.log("\nAvailable templates:");
    for (const kind of kinds) {
      const names = combosByKind(registry, kind).map(([name]) => name);
      console.log(`  ${KIND_LABELS[kind]}: ${names.join(", ")}`);
    }
    console.log("");
  }

  const picks: Array<{ comboName: string; combo: ComboEntry }> = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const available = combosByKind(registry, kind);
    if (!available.length) {
      console.error(`No combos registered for kind "${kind}".`);
      return null;
    }

    let comboName = flagFrameworks?.[i];
    if (comboName && !available.some(([name]) => name === comboName)) {
      const match = available.find(
        ([name]) => name === comboName || name.endsWith(`-${comboName}`),
      );
      comboName = match?.[0];
    }

    if (!comboName) {
      if (available.length === 1) {
        comboName = available[0][0];
      } else if (interactive) {
        const picked = await ask<string>({
          type: "select",
          name: "comboName",
          message: `Which ${KIND_FRAMEWORK_NOUN[kind]}?`,
          choices: available.map(([name]) => ({ title: name, value: name })),
        });
        if (!picked) {
          console.log("Cancelled.");
          return null;
        }
        comboName = picked;
      } else {
        console.error(
          `Multiple "${kind}" combos available (${available.map(([name]) => name).join(", ")}) — pass --framework to disambiguate.`,
        );
        return null;
      }
    }

    const combo = registry.combos[comboName];
    if (!combo) {
      console.error(`Unknown combo "${comboName}".`);
      return null;
    }
    picks.push({ comboName, combo });
  }

  let wantsWorkspaces: boolean;
  const requestedVariantFlag = flagString(flags.variant);
  if (flags.workspaces === true || requestedVariantFlag === "workspaces") {
    wantsWorkspaces = true;
  } else if (requestedVariantFlag === "base") {
    wantsWorkspaces = false;
  } else if (interactive) {
    const picked = await ask<boolean>({
      type: "confirm",
      name: "workspaces",
      message: "Include workspaces support?",
      initial: false,
    });
    if (picked === null) {
      console.log("Cancelled.");
      return null;
    }
    wantsWorkspaces = picked;
  } else {
    wantsWorkspaces = false;
  }

  const selections: Array<{
    comboName: string;
    combo: ComboEntry;
    variant: string;
  }> = [];
  for (const pick of picks) {
    const variant = resolveVariant(
      pick.combo,
      pick.comboName,
      wantsWorkspaces ? "workspaces" : DEFAULT_VARIANT,
    );
    if (!variant) return null;
    selections.push({ ...pick, variant });
  }
  return selections;
}

async function cmdCreate(
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const registry = await loadRegistry();
  const selections = await resolvePlan(registry, flags);
  if (!selections) {
    process.exitCode = 1;
    return;
  }
  // Two "merge" combos both target <targetRoot>/<installPath> by design (that's how a backend
  // fragment composes into a host project) — but two "scaffold" combos both writing whole
  // standalone apps (their own package.json, src/App.tsx, ...) into the *same* directory would
  // collide outright, and worse, each install's prune step would see the other's files as no
  // longer part of *its* install and delete them. So whenever more than one kind was picked in
  // this run, each gets its own <targetRoot>/<comboName> subdirectory — predictable, and safe
  // regardless of which mix of merge/scaffold combos ended up selected.
  const namespaced = selections.length > 1;
  for (const { comboName, combo, variant } of selections) {
    const installRoot = namespaced
      ? join(targetRoot, comboName)
      : resolveInstallRoot(comboName, combo, targetRoot, flags);
    if (installRoot !== targetRoot)
      await mkdir(installRoot, { recursive: true });
    // An explicit --name applies to every selection uniformly — fine for merge-mode combos
    // (they don't have their own package.json identity), but two scaffold apps both literally
    // named e.g. "combo-test" would collide if anything ever treats them as sibling packages
    // (a pnpm/npm workspace, for one). Suffix with the combo name once there's more than one.
    const installFlags =
      namespaced && flagString(flags.name)
        ? { ...flags, name: `${flagString(flags.name)}-${comboName}` }
        : flags;
    await installCombo(
      comboName,
      combo,
      variant,
      registry,
      installRoot,
      installFlags,
    );
  }
}

/**
 * Re-installs whatever combo+variant this project already has, read straight from
 * auth.lock.json — no need to remember or re-type what you originally ran `add` with. Defaults
 * to the safe (non-`--force`) merge: anything you haven't touched updates automatically, and
 * anything you have is left alone and reported, exactly like a first install. Pass `--force`
 * yourself if you really do want to overwrite local edits.
 */
async function cmdUpdate(
  targetRoot: string,
  flags: Record<string, string | true>,
) {
  const lock = await loadLock(targetRoot);
  if (!lock.combo || !lock.variant) {
    console.error(
      `No auth.lock.json (or it's missing combo/variant) in ${targetRoot} — nothing to update. Use "add <combo>" for a first install.`,
    );
    process.exitCode = 1;
    return;
  }

  const registry = await loadRegistry();
  const combo = registry.combos[lock.combo];
  if (!combo) {
    console.error(
      `auth.lock.json names combo "${lock.combo}", which no longer exists in this registry.`,
    );
    process.exitCode = 1;
    return;
  }

  const variant = resolveVariant(combo, lock.combo, lock.variant);
  if (!variant) {
    process.exitCode = 1;
    return;
  }

  if (flags.check === true && comboInstallMode(combo) === "scaffold") {
    console.error(
      `--check isn't supported for "${lock.combo}" (a scaffold-mode combo) — only merge-mode (api) combos support a dry run.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Updating "${lock.combo}" (${variant} variant) in ${targetRoot}${flags.force === true ? " — --force: local edits will be overwritten" : ""}`,
  );
  await installCombo(lock.combo, combo, variant, registry, targetRoot, flags);
}

/**
 * Shows the actual content diff between what's on disk and what the current registry would
 * produce — for every tracked file that differs, whether that's because the registry changed
 * upstream or because you hand-edited the file yourself (both are worth seeing before deciding
 * what to do). Read-only: never writes anything, unlike `update`.
 */
async function cmdDiff(targetRoot: string) {
  const lock = await loadLock(targetRoot);
  if (!lock.combo || !lock.variant) {
    console.error(
      `No auth.lock.json (or it's missing combo/variant) in ${targetRoot} — nothing installed to diff.`,
    );
    process.exitCode = 1;
    return;
  }

  const registry = await loadRegistry();
  const combo = registry.combos[lock.combo];
  if (!combo) {
    console.error(
      `auth.lock.json names combo "${lock.combo}", which no longer exists in this registry.`,
    );
    process.exitCode = 1;
    return;
  }

  if (comboInstallMode(combo) === "scaffold") {
    console.error(
      `diff isn't supported yet for "${lock.combo}" (a scaffold-mode combo) — only merge-mode (api) combos support it.`,
    );
    process.exitCode = 1;
    return;
  }

  const variant = resolveVariant(combo, lock.combo, lock.variant);
  if (!variant) {
    process.exitCode = 1;
    return;
  }

  const plan = await buildMergePlan(
    combo,
    variant,
    targetRoot,
    {},
    lock.files ?? {},
  );
  const diffs: DiffEntry[] = [];
  // force:true so a locally-modified file's difference is captured too — diff wants to show
  // everything that differs, not just what a real (non---force) install would apply; dryRun:true
  // so nothing is written.
  await runMergeCopy(plan, registry, targetRoot, {
    force: true,
    forcePaths: new Set(),
    dryRun: true,
    collectDiffs: diffs,
  });

  if (!diffs.length) {
    console.log(
      `No differences — every tracked file in "${lock.combo}" (${variant} variant) matches the current registry.`,
    );
    return;
  }

  console.log(`${diffs.length} file(s) differ from the current registry:`);
  for (const d of diffs) {
    const patch = createTwoFilesPatch(
      d.path,
      d.path,
      d.oldContent ?? "",
      d.newContent,
      "installed",
      "registry",
    );
    process.stdout.write(`\n${patch}`);
  }
}

async function printUsage(exitCode: number) {
  const registry = await loadRegistry();
  console.log("Usage: simple-auth-kit <init|add|update|diff> [...]");
  console.log(
    `  init [--config-only] [--kind ...] [--into <path>]  (fresh setup: guided "what do you need" picker, like bare "add")`,
  );
  console.log(
    `      --config-only: just write .simple-auth-kit.json and stop, no install`,
  );
  console.log(
    `  add <combo> [--workspaces] [--force] [--skip-install] [--into <path>] [--path <dir>] [--alias <alias>]`,
  );
  console.log(
    `  add [--kind api,admin,mobile] [--framework <name>,...] [--workspaces] [--into <path>] [--name <appName>]`,
  );
  console.log(
    `      (bare "add", or "add" with --kind but no combo, launches a guided prompt for whatever's missing)`,
  );
  console.log(
    `  update [--check] [--force] [--skip-install] [--into <path>]  (re-installs whatever combo+variant auth.lock.json already records)`,
  );
  console.log(
    `      --check: report what would change, without writing anything (merge-mode combos only)`,
  );
  console.log(
    `  diff [--into <path>]  (shows the actual content diff for every tracked file that differs from the current registry — read-only; merge-mode combos only)`,
  );
  console.log(
    `  In a TTY, without --force or --check: a file changed locally since install prompts to overwrite, per file.`,
  );
  console.log(
    `  --skip-install: don't run the package manager after copying files — the default is to install for you, shadcn-\`add\`-style.`,
  );
  console.log(
    `  --pm <npm|pnpm|yarn|bun>: which package manager to install with — default: detected from a lockfile in the target directory, npm if none found.`,
  );
  console.log(`\nAvailable combos:`);
  for (const kind of ["api", "admin", "mobile"] as Kind[]) {
    const names = combosByKind(registry, kind).map(([name]) => name);
    if (names.length)
      console.log(`  ${KIND_LABELS[kind]}: ${names.join(", ")}`);
  }
  console.log(`\nVariants (choose one at install time):`);
  for (const [name, variant] of Object.entries(registry.variants)) {
    console.log(
      `  ${name}${variant.flag ? ` (${variant.flag})` : " (default)"} — ${variant.description}`,
    );
  }
  process.exitCode = exitCode;
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const targetRoot = resolve(process.cwd(), flagString(flags.into) ?? ".");

  if (
    command === "--help" ||
    command === "-h" ||
    command === "help" ||
    flags.help === true
  ) {
    await printUsage(0);
    return;
  }
  if (!command && isTTY()) {
    // Bare `npx @simple-auth-kit/cli` in a real terminal — go straight to the guided picker
    // (same flow as `add` with no combo) instead of just printing help text.
    await cmdCreate(targetRoot, flags);
    return;
  }

  switch (command) {
    case "init":
      await cmdInit(targetRoot, flags);
      break;
    case "add": {
      const comboName = positional[0];
      if (!comboName) {
        // No combo named — guided multi-kind flow (interactive, or --kind/--framework/--workspaces).
        await cmdCreate(targetRoot, flags);
        break;
      }
      await cmdAdd(comboName, targetRoot, flags);
      break;
    }
    case "update":
      await cmdUpdate(targetRoot, flags);
      break;
    case "diff":
      await cmdDiff(targetRoot);
      break;
    default:
      await printUsage(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
