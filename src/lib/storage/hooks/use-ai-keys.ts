"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type AiKey } from "@/lib/storage/db";

const EMPTY_KEYS: AiKey[] = [];

export function useAiKeys() {
  const aiKeys = useLiveQuery(
    () => kokuDb.aiKeys.orderBy("createdAt").reverse().toArray(),
    [],
    EMPTY_KEYS,
  );

  async function saveAiKey(provider: string, apiKey: string) {
    const existing = await kokuDb.aiKeys.where("provider").equals(provider).first();
    const nextKey: AiKey = {
      id: existing?.id ?? crypto.randomUUID(),
      provider,
      apiKey,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await kokuDb.aiKeys.put(nextKey);
    return nextKey;
  }

  async function deleteAiKey(id: string) {
    await kokuDb.aiKeys.delete(id);
  }

  async function getApiKeyForProvider(provider: string) {
    return (await kokuDb.aiKeys.where("provider").equals(provider).first())?.apiKey ?? null;
  }

  return {
    aiKeys,
    saveAiKey,
    deleteAiKey,
    getApiKeyForProvider,
  };
}
