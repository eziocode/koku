"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type AiAuthMode, type AiCliConfig, type AiKey } from "@/lib/storage/db";

const EMPTY_KEYS: AiKey[] = [];

/**
 * Normalizes a possibly-pre-v9 AiKey (e.g. from an older local export) into
 * the current shape. The Dexie v9 `.upgrade()` handles rows already in the
 * database; this covers rows arriving through import, which bypasses that
 * upgrade path entirely.
 */
export function normalizeAiKey(value: Partial<AiKey> & { id: string; provider: string; createdAt: string }): AiKey {
  return {
    id: value.id,
    provider: value.provider,
    authMode: value.authMode ?? "api-key",
    apiKey: value.apiKey ?? "",
    cli: value.cli ?? null,
    lastVerifiedAt: value.lastVerifiedAt ?? null,
    createdAt: value.createdAt,
  };
}

export interface SaveConnectionInput {
  provider: string;
  authMode: AiAuthMode;
  apiKey?: string;
  cli?: AiCliConfig;
}

export function useAiKeys() {
  const aiKeys = useLiveQuery(
    () => kokuDb.aiKeys.orderBy("createdAt").reverse().toArray(),
    [],
    EMPTY_KEYS,
  );

  const verifiedConnections = aiKeys.filter((key) => key.lastVerifiedAt !== null);

  async function saveAiKey(provider: string, apiKey: string) {
    const existing = await kokuDb.aiKeys.where("provider").equals(provider).first();
    const nextKey: AiKey = {
      id: existing?.id ?? crypto.randomUUID(),
      provider,
      authMode: "api-key",
      apiKey,
      cli: null,
      lastVerifiedAt: null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await kokuDb.aiKeys.put(nextKey);
    return nextKey;
  }

  async function saveConnection(input: SaveConnectionInput) {
    const existing = await kokuDb.aiKeys.where("provider").equals(input.provider).first();
    const nextKey: AiKey = {
      id: existing?.id ?? crypto.randomUUID(),
      provider: input.provider,
      authMode: input.authMode,
      apiKey: input.authMode === "api-key" ? input.apiKey ?? "" : "",
      cli: input.authMode === "api-key" ? null : input.cli ?? null,
      lastVerifiedAt: null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    await kokuDb.aiKeys.put(nextKey);
    return nextKey;
  }

  async function markVerified(id: string) {
    await kokuDb.aiKeys.update(id, { lastVerifiedAt: new Date().toISOString() });
  }

  async function deleteAiKey(id: string) {
    await kokuDb.aiKeys.delete(id);
  }

  async function getApiKeyForProvider(provider: string) {
    return (await kokuDb.aiKeys.where("provider").equals(provider).first())?.apiKey ?? null;
  }

  async function getConnectionForProvider(provider: string) {
    return (await kokuDb.aiKeys.where("provider").equals(provider).first()) ?? null;
  }

  return {
    aiKeys,
    verifiedConnections,
    saveAiKey,
    saveConnection,
    markVerified,
    deleteAiKey,
    getApiKeyForProvider,
    getConnectionForProvider,
  };
}
