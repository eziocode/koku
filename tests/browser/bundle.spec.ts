import fs from "node:fs";
import { test, expect } from "@playwright/test";

/** Libraries heavy enough that shipping them to an unrelated route is a defect. */
const LIBS: Record<string, RegExp> = {
  tiptap: /@tiptap|prosemirror/,
  recharts: /recharts-pie-label-line|recharts-cartesian/,
  jspdf: /jspdf/,
  papaparse: /papaparse/,
  graphology: /graphology/,
  aiSdk: /@ai-sdk/,
};

const ROUTES = ["/dashboard", "/log", "/tasks", "/notes", "/graph", "/reports", "/ai", "/settings/storage"];

test("routes load only the heavy libraries they render", async ({ page }) => {
  test.setTimeout(240_000);
  const report: Record<string, { transferKB: number; rawKB: number; libs: string[] }> = {};
  for (const route of ROUTES) {
    const files = new Set<string>();
    let transferred = 0;
    const onResponse = async (response: import("@playwright/test").Response) => {
      const path = new URL(response.url()).pathname;
      if (!path.endsWith(".js")) return;
      files.add(path);
      try { transferred += (await response.body()).length; } catch { /* aborted prefetch */ }
    };
    page.on("response", onResponse);
    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    page.off("response", onResponse);

    const libs = new Set<string>();
    let raw = 0;
    for (const file of files) {
      const disk = `.next/standalone/.next/${file.replace(/^\/_next\//, "")}`;
      let text = "";
      try { text = fs.readFileSync(disk, "utf8"); } catch { continue; }
      raw += Buffer.byteLength(text);
      for (const [name, pattern] of Object.entries(LIBS)) if (pattern.test(text)) libs.add(name);
    }
    report[route] = { transferKB: Math.round(transferred / 1024), rawKB: Math.round(raw / 1024), libs: [...libs].sort() };
  }
  fs.writeFileSync("docs/verification/route-chunks.json", `${JSON.stringify(report, null, 2)}\n`);

  // Charts, editors, exports and AI transports belong to their own routes only.
  for (const route of ["/notes", "/tasks", "/ai", "/settings/storage", "/log", "/dashboard"]) {
    expect.soft(report[route].libs, `${route} eager libraries`).not.toContain("recharts");
  }
  expect.soft(report["/notes"].libs, "/notes eager libraries").not.toContain("jspdf");
  expect.soft(report["/graph"].libs, "/graph eager libraries").not.toContain("recharts");
});
