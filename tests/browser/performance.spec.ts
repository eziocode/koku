import os from "node:os";
import { writeFile } from "node:fs/promises";
import { test, expect, seedWorkspace } from "./workspace";

test("11,000-note production benchmark, five runs", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  await seedWorkspace(page);
  const search = page.getByPlaceholder("Search notes by title or tag");
  const samples: { searchMs: number; clearMs: number; routeMs: number }[] = [];
  for (let i = 0; i < 5; i++) {
    let start = performance.now();
    await search.fill("Synthetic note 00000");
    await expect(page.getByText("Synthetic note 00000", { exact: true })).toBeVisible({ timeout: 45_000 });
    const searchMs = performance.now() - start;
    start = performance.now();
    await search.fill("");
    await expect(page.getByText("Synthetic note 09999", { exact: true })).toBeVisible({ timeout: 45_000 });
    const clearMs = performance.now() - start;
    start = performance.now();
    await page.goto("/notes");
    await expect(page.getByText("Synthetic note 09999", { exact: true })).toBeVisible({ timeout: 45_000 });
    samples.push({ searchMs, clearMs, routeMs: performance.now() - start });
  }
  const reportPath = testInfo.outputPath("benchmark.json");
  await writeFile(reportPath, JSON.stringify({ browser: browser.version(), cpu: os.cpus()[0].model, platform: `${os.platform()} ${os.arch()}`, memoryGiB: os.totalmem() / 2 ** 30, samples }, null, 2));
  await testInfo.attach("benchmark.json", { path: reportPath, contentType: "application/json" });
});
