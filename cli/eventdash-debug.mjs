#!/usr/bin/env node
// DriveCore Branch Debug CLI
//
// Usage (from your repo root, in the VS Code terminal):
//   node ./cli/eventdash-debug.mjs "API throws 500 on /checkout for Amex cards"
//   node ./cli/eventdash-debug.mjs --base origin/main "describe the failure here"
//   node ./cli/eventdash-debug.mjs --editor cursor "..."
//
// Flags:
//   --base <ref>     Diff base. Default: auto-detects merge-base with origin/main, falls back to HEAD~1.
//   --editor <id>    vscode | cursor. Default: vscode.
//   --endpoint <url> Override API endpoint.
//
// Reads LOVABLE_ENDPOINT from env if --endpoint is not passed.

import { execSync } from "node:child_process";
import { resolve } from "node:path";

const DEFAULT_ENDPOINT =
  process.env.LOVABLE_ENDPOINT ||
  "https://project--bff39f15-1e2d-4d34-8f4b-7070bac6dbae.lovable.app/api/public/branch-debug";

const args = process.argv.slice(2);
const opts = {
  base: null,
  editor: "vscode",
  endpoint: DEFAULT_ENDPOINT,
  token: process.env.BRANCH_DEBUG_TOKEN || process.env.LOVABLE_BRANCH_DEBUG_TOKEN || "",
};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--base") opts.base = args[++i];
  else if (a === "--editor") opts.editor = args[++i];
  else if (a === "--endpoint") opts.endpoint = args[++i];
  else if (a === "--token") opts.token = args[++i];
  else if (a === "-h" || a === "--help") {
    console.log("Usage: node cli/eventdash-debug.mjs [--base <ref>] [--editor vscode|cursor] [--endpoint <url>] [--token <token>] \"failure description\"");
    console.log("\nAuth: pass --token, or set BRANCH_DEBUG_TOKEN env var. Required by the server.");
    process.exit(0);
  } else positional.push(a);
}

const failureDescription = positional.join(" ").trim();
if (!failureDescription) {
  console.error("✗ Provide a failure description as an argument.");
  console.error('  e.g. node cli/eventdash-debug.mjs "Checkout 500s on Amex cards after deploy"');
  process.exit(1);
}

if (!opts.token) {
  console.error("✗ Missing auth token. Set BRANCH_DEBUG_TOKEN env var or pass --token <token>.");
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
}

let repoRoot;
let branch;
try {
  repoRoot = sh("git rev-parse --show-toplevel");
  branch = sh("git rev-parse --abbrev-ref HEAD");
} catch {
  console.error("✗ Not inside a git repo. Run this from your project root.");
  process.exit(1);
}

// Determine base ref
let base = opts.base;
if (!base) {
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    try {
      base = sh(`git merge-base HEAD ${candidate}`);
      break;
    } catch { /* try next */ }
  }
  if (!base) base = "HEAD~1";
}

console.log(`▸ Repo:    ${repoRoot}`);
console.log(`▸ Branch:  ${branch}`);
console.log(`▸ Base:    ${base}`);
console.log(`▸ Failure: ${failureDescription}\n`);

let diff;
try {
  diff = sh(`git diff ${base}...HEAD`);
} catch (e) {
  console.error("✗ git diff failed:", e.message);
  process.exit(1);
}

if (!diff) {
  console.error("✗ Empty diff. Nothing changed between base and HEAD.");
  process.exit(1);
}

console.log(`▸ Sending ${(diff.length / 1024).toFixed(1)} KB diff to ${opts.endpoint} ...\n`);

const res = await fetch(opts.endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ diff, failureDescription, repoRoot, editor: opts.editor }),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`✗ API error ${res.status}: ${text}`);
  process.exit(1);
}

const data = await res.json();
const { summary, suspects, sanitizationStats } = data;

const C = { dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m", high: "\x1b[31m", med: "\x1b[33m", low: "\x1b[36m", link: "\x1b[34m" };
const tag = (c) => ({ high: C.high, medium: C.med, low: C.low }[c] || "");

console.log(`${C.bold}Summary${C.reset}\n  ${summary}\n`);
console.log(`${C.dim}IP Shield: ${sanitizationStats.identifiersTokenized} identifiers tokenized · ${sanitizationStats.commentsStripped} comments stripped · ${sanitizationStats.secretsBlocked} secrets blocked${C.reset}\n`);

if (!suspects?.length) {
  console.log("No suspects returned.");
  process.exit(0);
}

suspects.forEach((s, i) => {
  const jump = s.jumpUrl || `${opts.editor}://file/${resolve(repoRoot, s.filePath)}:${s.lineStart}`;
  console.log(`${tag(s.confidence)}${C.bold}[${i + 1}] ${s.confidence.toUpperCase()}${C.reset}  ${s.filePath}:${s.lineStart}-${s.lineEnd}${s.functionName ? `  ${C.dim}(${s.functionName})${C.reset}` : ""}`);
  console.log(`    ${C.bold}${s.changeSummary}${C.reset}`);
  console.log(`    ${s.mechanism}`);
  console.log(`    ${C.link}${jump}${C.reset}  ${C.dim}← ⌘-click to open in ${opts.editor === "cursor" ? "Cursor" : "VS Code"}${C.reset}\n`);
});
