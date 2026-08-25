import { z } from "zod";

import { ACCENT_KEYS, DEFAULT_ACCENT } from "@/lib/appearance";
import {
  MINI_PLAYER_DEFAULTS,
  miniPlayerPreferencesSchema,
} from "@/lib/mini-player/settings";
import {
  NOTIFICATION_DEFAULTS,
  notificationPreferencesSchema,
} from "@/lib/notifications/settings";
import { ONBOARDING_DEFAULTS, onboardingStateSchema } from "@/lib/onboarding/settings";

/**
 * Typed registry for the Dexie `settings` table.
 *
 * That table is `{ key: string; value: unknown }`, so historically every read
 * site narrowed `unknown` by hand (`typeof raw === "string" ? raw : "terracotta"`).
 * That was tolerable for two keys; this feature adds a dozen nested fields, so
 * narrowing moves here and happens exactly once, at the boundary.
 *
 * `parseSetting` never throws: a corrupt or partial row degrades to defaults
 * field by field rather than taking the app down or silently resetting
 * everything the user configured.
 */
export const SETTING_SCHEMAS = {
  accent: z.enum(ACCENT_KEYS).catch(DEFAULT_ACCENT),
  displayName: z.string().catch(""),
  timeFormat: z.enum(["12h", "24h"]).catch("12h"),
  notifications: notificationPreferencesSchema,
  miniPlayer: miniPlayerPreferencesSchema,
  onboarding: onboardingStateSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type TimeFormat = "12h" | "24h";

export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  accent: DEFAULT_ACCENT,
  displayName: "",
  timeFormat: "12h",
  notifications: NOTIFICATION_DEFAULTS,
  miniPlayer: MINI_PLAYER_DEFAULTS,
  onboarding: ONBOARDING_DEFAULTS,
};

/**
 * Narrows an untyped Dexie value once, at the boundary. Never throws.
 *
 * The schemas already `.catch(...)` internally, so `safeParse` failing at all is
 * close to impossible — the outer guard exists so a future schema without a
 * catch still cannot break a render.
 */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const result = SETTING_SCHEMAS[key].safeParse(raw);
  return (result.success ? result.data : SETTING_DEFAULTS[key]) as SettingValue<K>;
}
