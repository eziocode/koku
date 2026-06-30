#!/usr/bin/env node
/**
 * package-appsail.mjs
 *
 * Packages the Next.js standalone build into a zip file ready to upload
 * to Zoho Catalyst AppSail as the "Build File".
 *
 * Output: koku-appsail.zip
 *
 * Startup Command to enter in AppSail: node server.js
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = process.cwd();
const STANDALONE = resolve(ROOT, ".next/standalone");
const STATIC_SRC = resolve(ROOT, ".next/static");
const STATIC_DST = resolve(STANDALONE, ".next/static");
const PUBLIC_SRC = resolve(ROOT, "public");
const PUBLIC_DST = resolve(STANDALONE, "public");
const OUT = resolve(ROOT, "koku-appsail.zip");

if (!existsSync(STANDALONE)) {
  console.error("❌  .next/standalone not found — run `npm run build` first.");
  process.exit(1);
}

// Copy static assets and public folder into the standalone tree
// (Next.js standalone doesn't include them automatically)
console.log("📂  Copying static assets …");
mkdirSync(STATIC_DST, { recursive: true });
cpSync(STATIC_SRC, STATIC_DST, { recursive: true });

console.log("📂  Copying public folder …");
mkdirSync(PUBLIC_DST, { recursive: true });
cpSync(PUBLIC_SRC, PUBLIC_DST, { recursive: true });

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
console.log("    Startup Command: node server.js");
