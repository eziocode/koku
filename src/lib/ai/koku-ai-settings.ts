import { z } from "zod";

/**
 * Persisted state for the floating Koku AI launcher: where the user last
 * dragged it, and whether they closed it. Lives in the typed `settings`
 * schema (see `@/lib/settings/schema`) so it syncs cross-tab like every
 * other preference, rather than a bespoke localStorage key.
 */
export const kokuAiSettingsSchema = z
  .object({
    /** Fraction of viewport width/height, so it survives a resize sanely. */
    xFraction: z.number().min(0).max(1).catch(0.92),
    yFraction: z.number().min(0).max(1).catch(0.88),
    dismissed: z.boolean().catch(false),
  })
  .catch({ xFraction: 0.92, yFraction: 0.88, dismissed: false });

export type KokuAiSettings = z.infer<typeof kokuAiSettingsSchema>;

export const KOKU_AI_SETTINGS_DEFAULTS: KokuAiSettings = {
  xFraction: 0.92,
  yFraction: 0.88,
  dismissed: false,
};
