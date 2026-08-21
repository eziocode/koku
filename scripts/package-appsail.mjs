#!/usr/bin/env node
/**
 * package-appsail.mjs
 *
 * Packages the Next.js standalone build into a zip file ready to upload
 * to Zoho Catalyst AppSail as the "Build File".
 *
 * Output: koku-appsail.zip
 *
 * Startup Command to enter in AppSail: node appsail-server.cjs
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const START_COMMAND = "node appsail-server.cjs";
const STACK = "node24";

const ROOT = process.cwd();
const STANDALONE = resolve(ROOT, ".next/standalone");
const STATIC_SRC = resolve(ROOT, ".next/static");
const STATIC_DST = resolve(STANDALONE, ".next/static");
const SERVER_SRC = resolve(ROOT, ".next/server");
const SERVER_DST = resolve(STANDALONE, ".next/server");
const PUBLIC_SRC = resolve(ROOT, "public");
const PUBLIC_DST = resolve(STANDALONE, "public");
const ENTRY_SRC = resolve(ROOT, "scripts/appsail-server.cjs");
const ENTRY_DST = resolve(STANDALONE, "appsail-server.cjs");
const OUT = resolve(ROOT, "koku-appsail.zip");

if (!existsSync(STANDALONE)) {
  console.error("❌  .next/standalone not found — run `npm run build` first.");
  process.exit(1);
}

// Copy static assets, server files, and public folder into the standalone tree
// (Next.js standalone doesn't include them automatically)
console.log("📂  Copying static assets …");
mkdirSync(STATIC_DST, { recursive: true });
cpSync(STATIC_SRC, STATIC_DST, { recursive: true });

console.log("📂  Copying server files …");
mkdirSync(SERVER_DST, { recursive: true });
cpSync(SERVER_SRC, SERVER_DST, { recursive: true });

console.log("📂  Copying public folder …");
mkdirSync(PUBLIC_DST, { recursive: true });
cpSync(PUBLIC_SRC, PUBLIC_DST, { recursive: true });

// AppSail passes the port as X_ZOHO_CATALYST_LISTEN_PORT; Next's server.js only
// reads PORT. This entry point bridges the two.
console.log("📂  Copying AppSail entry point …");
cpSync(ENTRY_SRC, ENTRY_DST);

// Write app-config.json required by Catalyst AppSail
console.log("📝  Writing app-config.json …");
writeFileSync(
  resolve(STANDALONE, "app-config.json"),
  JSON.stringify({ command: START_COMMAND, stack: STACK }, null, 2)
);

// Sanity-check the bundle root before zipping — a missing entry point shows up
// on AppSail only as an opaque MODULE_NOT_FOUND at startup.
for (const required of ["server.js", "appsail-server.cjs", ".next/static", "public"]) {
  if (!existsSync(resolve(STANDALONE, required))) {
    console.error(`❌  Missing from bundle root: ${required}`);
    process.exit(1);
  }
}

// Remove old zip if present
if (existsSync(OUT)) rmSync(OUT);

// Zip the standalone directory, excluding local .env files
console.log("📦  Creating koku-appsail.zip …");
execSync(`cd "${STANDALONE}" && zip -r "${OUT}" . -x "*.env" -x ".env*"`, { stdio: "inherit" });

const { size } = (await import("fs")).statSync(OUT);
console.log(`\n✅  Done — koku-appsail.zip  (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log("\n📋  AppSail settings:");
console.log("    Stack:           Node 24");
console.log("    Build File:      koku-appsail.zip  ← upload this");
console.log(`    Startup Command: ${START_COMMAND}  ← must match exactly`);
