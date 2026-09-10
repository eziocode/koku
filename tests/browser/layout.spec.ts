import { test, expect, seedWorkspace } from "./workspace";

for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
  test(`${width}px ${theme}: core routes fit viewport and 200% zoom`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await seedWorkspace(page, 30);
    await page.evaluate((theme) => localStorage.setItem("theme", theme), theme);
    for (const route of ["/dashboard", "/log", "/tasks", "/notes", "/graph", "/reports", "/ai", "/settings/appearance", "/settings/storage"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      for (const zoom of [1, 2]) {
        // Browser zoom reduces the CSS layout viewport; CSS `zoom` alone
        // leaves media queries unchanged and gives misleading overflow results.
        // 320px is the narrowest layout Koku supports, so a zoomed phone
        // viewport stops there instead of shrinking to an untargeted 195px.
        await page.setViewportSize({ width: Math.max(320, Math.floor(width / zoom)), height: Math.floor(1000 / zoom) });
        await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll("/", "-")}-${zoom}x.png`) });
        const overflow = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          return { document: document.documentElement.scrollWidth - document.documentElement.clientWidth, main: main.scrollWidth - main.clientWidth };
        });
        if (overflow.main > 2) {
          const offenders = await page.locator("main").evaluate((main) => Array.from(main.querySelectorAll("*")).filter((element) => element.getBoundingClientRect().right > main.getBoundingClientRect().right + 2).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 70), width: element.getBoundingClientRect().width })).slice(0, 25));
          await testInfo.attach(`${route.replaceAll("/", "-")}-overflow.json`, { body: JSON.stringify(offenders, null, 2), contentType: "application/json" });
        }
        expect.soft(overflow.document, `${route} ${zoom}x document overflow`).toBeLessThanOrEqual(2);
        expect.soft(overflow.main, `${route} ${zoom}x main overflow`).toBeLessThanOrEqual(2);
      }
    }
  });
}
