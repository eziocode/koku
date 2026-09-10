#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prepareStandalone(root = process.cwd()) {
  const standalone = resolve(root, ".next/standalone");
  if (!existsSync(resolve(standalone, "server.js"))) {
    throw new Error("Standalone output missing — run npm run build first.");
  }
  for (const directory of [".next/static", ".next/server", "public"]) {
    const source = resolve(root, directory);
    const target = resolve(standalone, directory);
    if (!existsSync(source)) throw new Error(`Missing build assets: ${directory}`);
    mkdirSync(target, { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  cpSync(resolve(root, "appsail-server.cjs"), resolve(standalone, "appsail-server.cjs"));
  return standalone;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareStandalone();
  console.log("AppSail standalone assets and entry point prepared.");
}
