import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const requiredSecurityHeaders = [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
];
const unsafePatterns = [
  { name: "dangerouslySetInnerHTML", regex: /dangerouslySetInnerHTML/ },
  { name: "eval", regex: /\beval\s*\(/ },
  { name: "innerHTML assignment", regex: /\.innerHTML\s*=/ },
  { name: "raw localStorage secret", regex: /localStorage\.(?:setItem|getItem)\([^)]*(?:key|token|secret|password)/i },
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walk(path);
    }

    return /\.(tsx?|jsx?)$/.test(entry) ? [path] : [];
  });
}

function fail(message) {
  console.error(`security-audit: ${message}`);
  process.exitCode = 1;
}

const sourceFiles = walk(srcDir);
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const pattern of unsafePatterns) {
    if (pattern.regex.test(text)) {
      fail(`${pattern.name} found in ${relative(root, file)}`);
    }
  }
}

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
for (const header of requiredSecurityHeaders) {
  if (!nextConfig.includes(header)) {
    fail(`missing ${header} in next.config.ts`);
  }
}

const providers = readFileSync(join(srcDir, "lib/ai/providers.ts"), "utf8");
if (!providers.includes("AI_PROVIDERS") || !providers.includes("isAiProvider")) {
  fail("AI provider allowlist helpers are missing");
}

const routeFiles = sourceFiles.filter((file) => /src\/app\/api\/ai\/.+\/route\.ts$/.test(file));
for (const file of routeFiles) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("readAiJson") || !text.includes("handleAiRouteError")) {
    fail(`AI route lacks shared validation/error handling: ${relative(root, file)}`);
  }
}

if (!process.exitCode) {
  console.log("security-audit: passed");
}
