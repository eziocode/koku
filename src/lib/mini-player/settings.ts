import { z } from "zod";

/**
 * Mini-player preferences, stored as one Dexie `settings` row (key "miniPlayer").
 *
 * Defaults, and why:
 *
 * - `enabled: true` — this flag only controls whether the *pop-out affordance
 *   exists*. Nothing ever appears unbidden because of it, so opting out costs
 *   the user nothing, while off-by-default would bury a feature nobody then finds.
 *
 * - `autoOpenOnStart: true` — starting a timer is a click, and that click is the
 *   transient user activation the Document PiP API requires; there is no other
 *   moment koku is allowed to open the window. Worth knowing: Chromium *focuses*
 *   the new window, so this pulls focus the instant you hit Start. The toggle
 *   sits right next to the explanation for anyone who finds that jarring.
 *
 * - `autoOpenOnTabSwitch: true` — the behaviour people already expect from a
 *   PiP window: switch away from koku while something is being tracked and the
 *   player follows you, then folds itself away when you come back. It only ever
 *   opens while a timer or break is live, so it can never appear empty.
 */
export interface MiniPlayerPreferences {
  version: 1;
  enabled: boolean;
  autoOpenOnStart: boolean;
  autoOpenOnTabSwitch: boolean;
}

export const MINI_PLAYER_DEFAULTS: MiniPlayerPreferences = {
  version: 1,
  enabled: true,
  autoOpenOnStart: true,
  autoOpenOnTabSwitch: true,
};

export const miniPlayerPreferencesSchema = z
  .object({
    version: z.literal(1).catch(1),
    enabled: z.boolean().catch(MINI_PLAYER_DEFAULTS.enabled),
    autoOpenOnStart: z.boolean().catch(MINI_PLAYER_DEFAULTS.autoOpenOnStart),
    autoOpenOnTabSwitch: z.boolean().catch(MINI_PLAYER_DEFAULTS.autoOpenOnTabSwitch),
  })
  .catch(MINI_PLAYER_DEFAULTS);

/* Compile-time guarantee that schema output and interface never drift. */
const _schemaMatchesInterface: MiniPlayerPreferences =
  {} as z.infer<typeof miniPlayerPreferencesSchema>;
const _interfaceMatchesSchema: z.infer<typeof miniPlayerPreferencesSchema> =
  {} as MiniPlayerPreferences;
void _schemaMatchesInterface;
void _interfaceMatchesSchema;

/** Window geometry. Kept here so the surface and the controller agree. */
export const MINI_PLAYER_WIDTH = 380;
export const MINI_PLAYER_HEIGHT = 232;
