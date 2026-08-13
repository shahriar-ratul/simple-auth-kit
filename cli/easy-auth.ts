#!/usr/bin/env node
// Local-invocation CLI: run directly against this registry repo, e.g.
// `pnpm --filter easy-auth-cli run cli -- add nestjs-prisma --into ../my-app`.
//
// A combo ships in variants (see registry/README.md). `add <combo>` emits the default one;
// `add <combo> --workspaces` emits the workspace variant, composed by copying the combo's
// `shared/` directory and then `variants/<variant>/` over the top.
//
// Combos also carry a `kind` ("api" | "admin" | "mobile", defaults to "api" when absent) and an
// `installMode` ("merge" | "scaffold", defaults to "merge" for api / "scaffold" otherwise). "api"
// combos merge a source fragment into an existing project (today's only behavior, unchanged).
// "admin"/"mobile" combos scaffold a whole standalone app directly into --into, package.json and
// all. `add` with no combo positional launches a guided, shadcn-CLI-style prompt flow (via
// `prompts`) asking which kind(s) to generate, which framework per kind, and whether to include
// workspaces support — or reads the same choices from --kind/--framework/--workspaces for
// non-interactive/scripted use.
import { basename, dirname, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prompts from "prompts";
import { copyDir, CopyResult, NEVER_COPY, pruneRemovedFiles, SCAFFOLD_NEVER_COPY, sha256 } from "./lib/copy.js";
import { reconcileManifest, renameNative, type NativeIdentity } from "./lib/rename-native.js";

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = resolve(CLI_DIR, "..", "registry");
const CONFIG_FILENAME = ".easy-auth.json";
const DEFAULT_VARIANT = "base";

type Kind = "api" | "admin" | "mobile";
type InstallMode = "merge" | "scaffold";

const KIND_LABELS: Record<Kind, string> = { api: "API (backend)", admin: "Admin console", mobile: "Mobile app" };
const KIND_FRAMEWORK_NOUN: Record<Kind, string> = { api: "API stack", admin: "admin framework", mobile: "mobile framework" };

/** Flags that take no value. Everything else consumes the next argv entry. */
const BOOLEAN_FLAGS = new Set(["workspaces", "force"]);

interface EasyAuthConfig {
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

const DEFAULT_CONFIG: EasyAuthConfig = { path: "src/lib/auth", alias: "@/lib/auth", ignore: [] };

const comboKind = (combo: ComboEntry): Kind => combo.kind ?? "api";
const comboInstallMode = (combo: ComboEntry): InstallMode => combo.installMode ?? (comboKind(combo) === "api" ? "merge" : "scaffold");

function parseArgs(argv: string[]): { command?: string; positional: string[]; flags: Record<string, string | true> } {
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

const flagString = (value: string | true | undefined): string | undefined => (typeof value === "string" ? value : undefined);
const flagList = (value: string | true | undefined): string[] | undefined =>
  typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

async function loadRegistry(): Promise<Registry> {
  return JSON.parse(await readFile(join(CLI_DIR, "registry.json"), "utf8"));
}

async function loadConfig(targetRoot: string): Promise<EasyAuthConfig> {
  try {
    const raw = await readFile(join(targetRoot, CONFIG_FILENAME), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadLock(targetRoot: string): Promise<AuthLock> {
  try {
    return JSON.parse(await readFile(join(targetRoot, "auth.lock.json"), "utf8"));
  } catch {
    return {};
  }
}

async function cmdInit(targetRoot: string, flags: Record<string, string | true>) {
  const config: EasyAuthConfig = {
    path: flagString(flags.path) ?? DEFAULT_CONFIG.path,
    alias: flagString(flags.alias) ?? DEFAULT_CONFIG.alias,
    ignore: [],
  };
  await writeFile(join(targetRoot, CONFIG_FILENAME), JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Wrote ${CONFIG_FILENAME} — combos will install into ${config.path} (import alias ${config.alias})`);
}

function resolveVariant(combo: ComboEntry, comboName: string, requested: string): string | null {
  if (combo.variants.length === 0) {
    console.error(`Combo "${comboName}" has not been migrated to the variant layout yet (see registry/README.md) — nothing to install.`);
    return null;
  }
  if (!combo.variants.includes(requested)) {
    console.error(`Combo "${comboName}" has no "${requested}" variant. Available: ${combo.variants.join(", ")}`);
    return null;
  }
  return requested;
}

function requestedVariant(flags: Record<string, string | true>): string {
  return flags.workspaces === true ? "workspaces" : (flagString(flags.variant) ?? DEFAULT_VARIANT);
}

function printInstallSummary(result: CopyResult, pruned: { removed: string[]; keptModified: string[] }) {
  if (result.skipped.length) {
    console.log(`\nLeft alone — modified since the last install (re-run with --force to overwrite):`);
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
    console.log(`\nNo longer part of this install, but modified locally, so kept (delete by hand if you don't want them):`);
    for (const file of pruned.keptModified) console.log(`  ${file}`);
  }
}

function printPostInstallNotes(combo: ComboEntry, variant: string) {
  const notes = [...combo.postInstall, ...(combo.variantPostInstall?.[variant] ?? [])];
  if (notes.length) {
    console.log(`\nNext steps:`);
    for (const note of notes) console.log(`  - ${note}`);
  }
}

/** "merge" install — today's only behavior, unchanged: core + shared + variant merged into an
 * existing project at <targetRoot>/<installPath>, with the core import alias rewritten. */
async function installMerge(comboName: string, combo: ComboEntry, variant: string, registry: Registry, targetRoot: string, flags: Record<string, string | true>) {
  const config = await loadConfig(targetRoot);
  const installPath = flagString(flags.path) ?? config.path;
  const alias = flagString(flags.alias) ?? config.alias;
  const destRoot = resolve(targetRoot, installPath);

  const lock = await loadLock(targetRoot);
  const previous = lock.files ?? {};
  const force = flags.force === true;

  const copyOpts = { aliasFrom: "@/lib/auth/core", aliasTo: `${alias}/core`, previous, force, ignore: config.ignore, neverCopy: NEVER_COPY };
  const result: CopyResult = { manifest: {}, skipped: [], ignored: [] };

  const comboDir = join(REGISTRY_ROOT, combo.dir);
  await copyDir(join(REGISTRY_ROOT, registry.core.dir), join(destRoot, "core"), copyOpts, destRoot, result);
  await copyDir(join(comboDir, combo.sharedDir ?? "shared"), destRoot, copyOpts, destRoot, result);
  await copyDir(join(comboDir, combo.variantsDir ?? "variants", variant), destRoot, copyOpts, destRoot, result);

  // Switching variants has to remove the old variant's files, or the project ends up with both wired in.
  const pruned = await pruneRemovedFiles(destRoot, previous, result, { force, ignore: config.ignore });

  await writeFile(
    join(targetRoot, "auth.lock.json"),
    JSON.stringify({ ...lock, combo: comboName, variant, installedAt: new Date().toISOString(), files: result.manifest }, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nInstalled "${comboName}" (${variant} variant) into ${installPath} (alias ${alias})`);
  printInstallSummary(result, pruned);

  const peerDeps = [...new Set([...registry.core.peerDependencies, ...combo.peerDependencies])];
  console.log(`\nInstall peer dependencies:\n  npm install ${peerDeps.join(" ")}`);
  printPostInstallNotes(combo, variant);
}

/** "scaffold" install — admin/mobile apps materialized as a whole standalone project directly
 * into targetRoot: no core layer, no alias rewrite, package.json is real content (copied and
 * name/description-templated), not the registry's own dev wiring. */
async function installScaffold(comboName: string, combo: ComboEntry, variant: string, targetRoot: string, flags: Record<string, string | true>) {
  const lock = await loadLock(targetRoot);
  const previous = lock.files ?? {};
  const force = flags.force === true;

  const copyOpts = { previous, force, neverCopy: SCAFFOLD_NEVER_COPY };
  const result: CopyResult = { manifest: {}, skipped: [], ignored: [] };

  const comboDir = join(REGISTRY_ROOT, combo.dir);
  await copyDir(join(comboDir, combo.sharedDir ?? "shared"), targetRoot, copyOpts, targetRoot, result);
  await copyDir(join(comboDir, combo.variantsDir ?? "variants", variant), targetRoot, copyOpts, targetRoot, result);

  const pruned = await pruneRemovedFiles(targetRoot, previous, result, { force });

  const appName = flagString(flags.name) ?? basename(targetRoot);

  if (combo.nativeIdentity) {
    const renamed = await renameNative(targetRoot, combo.nativeIdentity, appName);
    result.manifest = reconcileManifest(result.manifest, renamed);
  }

  const pkgPath = join(targetRoot, "package.json");
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.name = appName;
    pkg.description = `Generated by easy-auth (${comboName}, ${variant} variant).`;
    const content = JSON.stringify(pkg, null, 2) + "\n";
    await writeFile(pkgPath, content, "utf8");
    result.manifest["package.json"] = sha256(content); // keep the manifest honest post-template
  } catch {
    // No package.json in this combo's template — nothing to name.
  }

  await writeFile(
    join(targetRoot, "auth.lock.json"),
    JSON.stringify({ ...lock, combo: comboName, variant, installedAt: new Date().toISOString(), files: result.manifest }, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nGenerated "${appName}" (${comboName}, ${variant} variant) into ${targetRoot}`);
  printInstallSummary(result, pruned);
  console.log(`\nDependencies are already declared in package.json — run \`npm install\` (or \`pnpm install\`) in ${targetRoot}.`);
  printPostInstallNotes(combo, variant);
}

async function installCombo(comboName: string, combo: ComboEntry, variant: string, registry: Registry, targetRoot: string, flags: Record<string, string | true>) {
  if (comboInstallMode(combo) === "scaffold") {
    await installScaffold(comboName, combo, variant, targetRoot, flags);
  } else {
    await installMerge(comboName, combo, variant, registry, targetRoot, flags);
  }
}

async function cmdAdd(comboName: string, targetRoot: string, flags: Record<string, string | true>) {
  const registry = await loadRegistry();
  const combo = registry.combos[comboName];
  if (!combo) {
    console.error(`Unknown combo "${comboName}". Available: ${Object.keys(registry.combos).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const variant = resolveVariant(combo, comboName, requestedVariant(flags));
  if (!variant) {
    process.exitCode = 1;
    return;
  }

  await installCombo(comboName, combo, variant, registry, targetRoot, flags);
}

function combosByKind(registry: Registry, kind: Kind): Array<[string, ComboEntry]> {
  return Object.entries(registry.combos).filter(([, combo]) => comboKind(combo) === kind);
}

const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Wraps a single `prompts()` call so a cancel (Ctrl+C) surfaces as `null` instead of `undefined`,
 * which prompts itself doesn't distinguish from "field asked but left empty". */
async function ask<T>(question: Parameters<typeof prompts>[0] & { name: string }): Promise<T | null> {
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
async function resolvePlan(registry: Registry, flags: Record<string, string | true>): Promise<Array<{ comboName: string; combo: ComboEntry; variant: string }> | null> {
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
      choices: (Object.keys(KIND_LABELS) as Kind[]).map((value) => ({ title: KIND_LABELS[value], value })),
      min: 1,
      instructions: false,
    });
    if (!picked || picked.length === 0) {
      console.log("Cancelled.");
      return null;
    }
    kinds = picked;
  } else {
    console.error("Non-interactive session: pass --kind api,admin,mobile (comma-separated), or a specific combo name (easy-auth add <combo>).");
    return null;
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
      const match = available.find(([name]) => name === comboName || name.endsWith(`-${comboName}`));
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
        console.error(`Multiple "${kind}" combos available (${available.map(([name]) => name).join(", ")}) — pass --framework to disambiguate.`);
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
    const picked = await ask<boolean>({ type: "confirm", name: "workspaces", message: "Include workspaces support?", initial: false });
    if (picked === null) {
      console.log("Cancelled.");
      return null;
    }
    wantsWorkspaces = picked;
  } else {
    wantsWorkspaces = false;
  }

  const selections: Array<{ comboName: string; combo: ComboEntry; variant: string }> = [];
  for (const pick of picks) {
    const variant = resolveVariant(pick.combo, pick.comboName, wantsWorkspaces ? "workspaces" : DEFAULT_VARIANT);
    if (!variant) return null;
    selections.push({ ...pick, variant });
  }
  return selections;
}

async function cmdCreate(targetRoot: string, flags: Record<string, string | true>) {
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
    const installRoot = namespaced ? join(targetRoot, comboName) : targetRoot;
    if (namespaced) await mkdir(installRoot, { recursive: true });
    // An explicit --name applies to every selection uniformly — fine for merge-mode combos
    // (they don't have their own package.json identity), but two scaffold apps both literally
    // named e.g. "combo-test" would collide if anything ever treats them as sibling packages
    // (a pnpm/npm workspace, for one). Suffix with the combo name once there's more than one.
    const installFlags = namespaced && flagString(flags.name) ? { ...flags, name: `${flagString(flags.name)}-${comboName}` } : flags;
    await installCombo(comboName, combo, variant, registry, installRoot, installFlags);
  }
}

async function cmdDiff(targetRoot: string) {
  const lock = await loadLock(targetRoot);
  if (!lock.files) {
    console.error(`No auth.lock.json found in ${targetRoot} — nothing installed yet.`);
    return;
  }
  console.log(`diff is not implemented yet (deferred until there's more than one install to maintain) — installed files:`);
  console.log(`  combo: ${lock.combo}, variant: ${lock.variant ?? DEFAULT_VARIANT}`);
  for (const file of Object.keys(lock.files)) console.log(`  ${file}`);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const targetRoot = resolve(process.cwd(), flagString(flags.into) ?? ".");

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
    case "diff":
      await cmdDiff(targetRoot);
      break;
    default: {
      const registry = await loadRegistry();
      console.log("Usage: easy-auth <init|add|diff> [...]");
      console.log(`  add <combo> [--workspaces] [--force] [--into <path>] [--path <dir>] [--alias <alias>]`);
      console.log(`  add [--kind api,admin,mobile] [--framework <name>,...] [--workspaces] [--into <path>] [--name <appName>]`);
      console.log(`      (bare "add", or "add" with --kind but no combo, launches a guided prompt for whatever's missing)`);
      console.log(`\nAvailable combos:`);
      for (const kind of ["api", "admin", "mobile"] as Kind[]) {
        const names = combosByKind(registry, kind).map(([name]) => name);
        if (names.length) console.log(`  ${KIND_LABELS[kind]}: ${names.join(", ")}`);
      }
      console.log(`\nVariants (choose one at install time):`);
      for (const [name, variant] of Object.entries(registry.variants)) {
        console.log(`  ${name}${variant.flag ? ` (${variant.flag})` : " (default)"} — ${variant.description}`);
      }
      process.exitCode = command ? 1 : 0;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
