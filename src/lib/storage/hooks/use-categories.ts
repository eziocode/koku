"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Category } from "@/lib/storage/db";
import { putLocal, updateLocal, deleteLocal, localTransaction } from "@/lib/storage/local-write";

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

    await putLocal(kokuDb.categories, category, true);
    return category;
  }

  async function updateCategory(
    id: string,
    patch: Partial<Omit<Category, "id" | "createdAt">>,
  ) {
    await updateLocal(kokuDb.categories, id, patch);
  }

  async function deleteCategory(id: string) {
    await localTransaction([kokuDb.categories, kokuDb.timeEntries, kokuDb.tasks], async () => {
      const entries = await kokuDb.timeEntries.where("categoryId").equals(id).toArray();
      const tasks = await kokuDb.tasks.where("categoryId").equals(id).toArray();
      for (const entry of entries) await putLocal(kokuDb.timeEntries, { ...entry, categoryId: null });
      for (const task of tasks) await putLocal(kokuDb.tasks, { ...task, categoryId: null });
      await deleteLocal(kokuDb.categories, id);
    });
  }

  return {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
