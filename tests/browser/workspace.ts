import { test as base, expect, type Page } from "@playwright/test";

// Every test receives a fresh, non-persistent browser context. Never connect to
// an existing browser profile or a user-supplied server.
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.route("**/api/**", (route) => route.fulfill({
      status: route.request().url().includes("/ai/") ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null, rows: [], error: "Synthetic offline fixture" }),
    }));
    await run(page);
  },
});
export { expect };

export async function seedWorkspace(page: Page, count = 11_000) {
  await page.goto("/");
  await page.waitForFunction(async () => (await indexedDB.databases()).some((db) => db.name === "koku-local"));
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("koku-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ["notes", "personalNotes", "settings", "storageMeta"];
    // Native IDB fixture writes intentionally bypass app code. Seed derived
    // metadata too when running against a version that has it.
    for (const name of ["noteMetadata", "personalNoteMetadata"]) if (db.objectStoreNames.contains(name)) stores.push(name);
    const tx = db.transaction(stores, "readwrite");
    const date = "2026-09-01T10:00:00.000Z";
    for (let i = 0; i < count; i++) {
      const personal = i >= 10_000;
      const note = { id: `synthetic-${i}`, title: `${personal ? "Private" : "Synthetic"} note ${String(i).padStart(5, "0")}`, slug: `synthetic-${i}`, tags: [`tag-${i % 20}`], createdAt: date, updatedAt: date,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Fixture ${i} `.repeat(100) }] }] } };
      tx.objectStore(personal ? "personalNotes" : "notes").put(note);
      const metadata = personal ? "personalNoteMetadata" : "noteMetadata";
      if (stores.includes(metadata)) {
        const row = { id: note.id, title: note.title, slug: note.slug, tags: note.tags, createdAt: note.createdAt, updatedAt: note.updatedAt };
        tx.objectStore(metadata).put(row);
      }
    }
    tx.objectStore("settings").put({ key: "displayName", value: "Synthetic tester" });
    tx.objectStore("settings").put({ key: "onboarding", value: { displayNameSetAt: date, weekOffSetAt: date, endOfDaySetAt: date, notificationsSetAt: date } });
    tx.objectStore("storageMeta").put({ key: "syncPaused", value: true });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    db.close();
  }, count);
  await page.goto("/notes");
  await expect(page.getByPlaceholder("Search notes by title or tag")).toBeVisible();
  await expect(page.getByText(`Synthetic note ${String(Math.min(count, 10_000) - 1).padStart(5, "0")}`, { exact: true })).toBeVisible({ timeout: 45_000 });
}

export async function rows(page: Page, table: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (table) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("koku-local"); request.onsuccess = () => resolve(request.result); });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, table);
}
