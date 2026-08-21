"use client";

import { useCallback } from "react";

import { kokuDb } from "@/lib/storage/db";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import {
  parseSetting,
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingValue,
} from "@/lib/settings/schema";

/** Recursive partial, so a settings card can patch just the fields it owns. */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Merges a patch into a value, recursing into plain objects only.
 *
 * Arrays are replaced wholesale rather than merged by index — for
 * `breaks.presetMinutes` that is the only sane behaviour ("these are now the
 * presets", not "override the third one").
 */
function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) {
    return base;
  }

  if (Array.isArray(patch) || typeof patch !== "object" || typeof base !== "object" || base === null) {
    return patch as T;
  }

  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) {
      continue;
    }

    const current = (base as Record<string, unknown>)[key];
    next[key] =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
        ? mergeDeep(current as Record<string, unknown>, value as DeepPartial<Record<string, unknown>>)
        : value;
  }

  return next as T;
}

/**
 * Reads and writes one row of the Dexie `settings` table with a real type.
 *
 * Reactive via `liveQuery`, which is cross-tab in Dexie — so DND toggled in one
 * tab updates the topbar pill in every other tab with no extra plumbing.
 */
export function useTypedSetting<K extends SettingKey>(key: K) {
  const row = useLiveQuery(() => kokuDb.settings.get(key), [key]);
  const value = parseSetting(key, row?.value);

  const setValue = useCallback(
    async (next: SettingValue<K>) => {
      await kokuDb.settings.put({ key, value: next });
    },
    [key],
  );

  /**
   * Atomic read-modify-write.
   *
   * This MUST stay inside a Dexie `rw` transaction. IndexedDB serializes
   * transactions across tabs, which is what stops two tabs — or two settings
   * cards racing in one tab — from clobbering each other's fields. Patching by
   * spreading the `value` snapshot above would reintroduce exactly that bug,
   * because that snapshot can be stale by the time the write lands.
   */
  const patchValue = useCallback(
    async (patch: DeepPartial<SettingValue<K>>) => {
      await kokuDb.transaction("rw", kokuDb.settings, async () => {
        const existing = await kokuDb.settings.get(key);
        const current = parseSetting(key, existing?.value);
        const merged = parseSetting(key, mergeDeep(current, patch));
        await kokuDb.settings.put({ key, value: merged });
      });
    },
    [key],
  );

  const reset = useCallback(async () => {
    await kokuDb.settings.put({ key, value: SETTING_DEFAULTS[key] });
  }, [key]);

  return { value, setValue, patchValue, reset };
}
