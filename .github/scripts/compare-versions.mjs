#!/usr/bin/env node
// Decides whether packages/auth-client's local version should be published: publish whenever it
// differs from what's currently live on npm (in either direction), skip when it's the same.
// Writes `skip=true|false` to $GITHUB_OUTPUT.
//
// Note: this does not check that the local version is *newer* than published — a lower version
// will still publish, and `npm publish` moves the registry's `latest` tag to whatever it just
// published regardless of semver order. That's a deliberate choice (kept simple on request);
// if that footgun ever bites, the fix is reintroducing a newer-than check here.
//
// Usage: node compare-versions.mjs <localVersion> <publishedVersionOrEmpty>
import { appendFileSync } from "node:fs";

const [local, published] = process.argv.slice(2);

function writeOutput(line) {
  const path = process.env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, line + "\n");
  else console.log(`[GITHUB_OUTPUT unset, would write] ${line}`);
}

if (!published) {
  console.log(`no published version yet — publishing ${local}`);
  writeOutput("skip=false");
} else if (local === published) {
  console.log("already published — skipping");
  writeOutput("skip=true");
} else {
  console.log(`local (${local}) differs from published (${published}) — publishing`);
  writeOutput("skip=false");
}
