"use client";

import { useMemo } from "react";
import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type AppSetting } from "@/lib/storage/db";

const EMPTY_SETTINGS: AppSetting[] = [];

export function useSettings() {
  const settings = useLiveQuery(() => kokuDb.settings.toArray(), [], EMPTY_SETTINGS);
  const settingsMap = useMemo(
    () => new Map(settings.map((setting) => [setting.key, setting.value])),
    [settings],
  );

  function getSetting(key: string) {
    return settingsMap.get(key);
  }

  async function setSetting(key: string, value: unknown) {
    const nextSetting = { key, value };
    await kokuDb.settings.put(nextSetting);
    return nextSetting;
  }

  return {
    settings,
    getSetting,
    setSetting,
  };
}
