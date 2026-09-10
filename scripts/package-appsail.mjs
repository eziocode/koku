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

import { existsSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";

import { prepareStandalone } from "./prepare-appsail.mjs";

const START_COMMAND = "node appsail-server.cjs";
const STACK = "node24";

const ROOT = process.cwd();
const STANDALONE = resolve(ROOT, ".next/standalone");
const OUT = resolve(ROOT, "koku-appsail.zip");

prepareStandalone(ROOT);

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
execFileSync("zip", ["-r", OUT, ".", "-x", "*.env", "-x", ".env*", "-x", "*/.env*"], { cwd: STANDALONE, stdio: "inherit" });

const { size } = (await import("fs")).statSync(OUT);
console.log(`\n✅  Done — koku-appsail.zip  (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log("\n📋  AppSail settings:");
console.log("    Stack:           Node 24");
console.log("    Build File:      koku-appsail.zip  ← upload this");
console.log(`    Startup Command: ${START_COMMAND}  ← must match exactly`);
