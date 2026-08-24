"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Category } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

const EMPTY_CATEGORIES: Category[] = [];

interface CreateCategoryInput {
  name: string;
  color: string;
}

export function useCategories() {
  const categories = useLiveQuery(
    () => kokuDb.categories.orderBy("name").toArray(),
    [],
    EMPTY_CATEGORIES,
  );

  async function createCategory(data: CreateCategoryInput) {
    const category: Category = {
      id: crypto.randomUUID(),
      name: data.name,
      color: data.color,
      createdAt: new Date().toISOString(),
    };

    await kokuDb.categories.add(category);
    void syncRow("categories", category);
    return category;
  }

  async function updateCategory(
    id: string,
    patch: Partial<Omit<Category, "id" | "createdAt">>,
  ) {
    await kokuDb.categories.update(id, patch);
    const updated = await kokuDb.categories.get(id);
    if (updated) void syncRow("categories", updated);
  }

  async function deleteCategory(id: string) {
    const affectedEntries = await kokuDb.timeEntries.where("categoryId").equals(id).toArray();
    await kokuDb.transaction("rw", kokuDb.categories, kokuDb.timeEntries, async () => {
      await kokuDb.timeEntries.where("categoryId").equals(id).modify({ categoryId: null });
      await kokuDb.categories.delete(id);
    });
    await Promise.all(affectedEntries.map((entry) => syncRow("timeEntries", { ...entry, categoryId: null })));
    void deleteRow("categories", id);
  }

  return {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
