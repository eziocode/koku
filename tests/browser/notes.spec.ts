import { test, expect, seedWorkspace, rows } from "./workspace";

test("immediate title edit survives navigation and reload", async ({ page }) => {
  await seedWorkspace(page, 30);
  await page.getByText("Synthetic note 00029", { exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Immediate durable edit");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Notes", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.reload();
  await expect(page.getByText("Immediate durable edit", { exact: true })).toBeVisible();
  expect((await rows(page, "notes")).find((note) => note.id === "synthetic-29")?.title).toBe("Immediate durable edit");
});

test("quota failure keeps original note and recoverable draft", async ({ page }) => {
  await seedWorkspace(page, 30);
  await page.getByText("Synthetic note 00029", { exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Synthetic note 00029");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "pendingUpserts") throw new DOMException("Synthetic quota exhaustion", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Title", { exact: true }).fill("Recover this draft");
  await expect(page.getByText(/Synthetic quota exhaustion/)).toBeVisible();
  expect((await rows(page, "notes")).find((note) => note.id === "synthetic-29")?.title).toBe("Synthetic note 00029");
  expect((await rows(page, "noteDrafts"))[0]?.payload).toMatchObject({ title: "Recover this draft" });
  await page.reload();
  expect((await rows(page, "noteDrafts"))[0]?.payload).toMatchObject({ title: "Recover this draft" });
});

test("two editors preserve conflicting draft", async ({ page, context }) => {
  await seedWorkspace(page, 30);
  await page.getByText("Synthetic note 00029", { exact: true }).click();
  await expect(page).toHaveURL(/id=synthetic-29/);
  const other = await context.newPage();
  await other.route("**/api/**", (route) => route.fulfill({ json: { user: null, rows: [] } }));
  await other.goto(page.url());
  await expect(other.getByLabel("Title", { exact: true })).toHaveValue("Synthetic note 00029");
  await page.getByLabel("Title", { exact: true }).fill("First editor saved");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await other.getByLabel("Title", { exact: true }).fill("Second editor draft");
  await expect(other.getByText(/Note changed elsewhere/)).toBeVisible();
  expect((await rows(page, "notes")).find((note) => note.id === "synthetic-29")?.title).toBe("First editor saved");
  expect((await rows(page, "noteDrafts"))[0]?.payload).toMatchObject({ title: "Second editor draft" });
});

test("large workspace windows cards, searches tags and isolates personal notes", async ({ page }) => {
  await seedWorkspace(page);
  expect(await page.getByRole("button", { name: "Delete note", exact: true }).count()).toBeLessThan(100);
  await page.getByPlaceholder("Search notes by title or tag").fill("Private");
  await expect(page.getByText("No notes found.")).toBeVisible();
  await page.getByRole("tab", { name: "Personal notes", exact: true }).click();
  await page.getByPlaceholder("Search notes by title or tag").fill("Private note 10999");
  await expect(page.getByText("Private note 10999", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Shared notes", exact: true }).click();
  await page.getByPlaceholder("Search notes by title or tag").fill("tag-19");
  await expect(page.getByText("Synthetic note 09999", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notes", exact: true })).toBeVisible();
  await page.getByText("Synthetic note 09999", { exact: true }).focus();
  for (let i = 0; i < 80; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="region"][aria-label="Notes"]') !== null)).toBe(true);
});
