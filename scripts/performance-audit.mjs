import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const heavyImports = [
  "xlsx",
  "jspdf",
  "jspdf-autotable",
  "@tiptap/react",
  "sigma",
  "graphology",
  "recharts",
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

function isAllowedStaticHeavyImport(file, specifier) {
  const normalized = relative(root, file);
  if (specifier === "recharts") {
    return normalized.startsWith("src/components/charts/");
  }

  if (specifier === "@tiptap/react") {
    return normalized === "src/components/editor/tiptap-editor.tsx";
  }

  if (specifier === "sigma" || specifier === "graphology") {
    // GraphClient lazy-loads both graph views; GraphCanvas is their shared
    // renderer, so these imports remain in that deferred graph-only chunk.
    return normalized === "src/components/graph/graph-canvas.tsx";
  }

  return false;
}

const sourceFiles = walk(srcDir);
const findings = [];

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const specifier of heavyImports) {
    const staticImport = new RegExp(`import\\s+[^;]+from\\s+[\"']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`);
    if (staticImport.test(text) && !isAllowedStaticHeavyImport(file, specifier)) {
      findings.push(`${relative(root, file)} statically imports ${specifier}`);
    }
  }
}

const analyzeDir = join(root, ".next/diagnostics/analyze");
if (existsSync(analyzeDir)) {
  console.log(`performance-audit: bundle analyzer output exists at ${relative(root, analyzeDir)}`);
} else {
  console.log("performance-audit: run `npm run audit:bundle` for Next bundle analyzer output");
}

if (findings.length) {
  for (const finding of findings) {
    console.error(`performance-audit: ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("performance-audit: passed");
}
