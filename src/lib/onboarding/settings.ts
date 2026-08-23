import { z } from "zod";

/**
 * One-time introductions, stored as one Dexie `settings` row (key "onboarding").
 *
 * A timestamp rather than a boolean: "seen" answers less than "seen when", and
 * if a later release changes what the check-in intro says, comparing against a
 * release date is enough to re-show it without inventing a second flag.
 *
 * `null` means never shown. It lives in Dexie alongside every other preference,
 * so it syncs across tabs and survives a `localStorage` clear the same way the
 * rest of koku's settings do.
 */
export interface OnboardingState {
  version: 1;
  /** When the recurring check-in explainer was acknowledged. */
  checkInIntroSeenAt: string | null;
  /**
   * When the user supplied their end-of-day logoff time.
   *
   * Needed as a separate flag because `endOfDay.logoffTime` always holds a
   * value (it defaults to "18:00"), so the preference itself cannot answer
   * "has the user actually told us?" — and the setup prompt is mandatory, so
   * getting that answer wrong either blocks a configured user forever or lets
   * an unconfigured one through.
   */
  endOfDaySetAt: string | null;
}

export const ONBOARDING_DEFAULTS: OnboardingState = {
  version: 1,
  checkInIntroSeenAt: null,
  endOfDaySetAt: null,
};

export const onboardingStateSchema = z
  .object({
    version: z.literal(1).catch(1),
    checkInIntroSeenAt: z.string().nullable().catch(null),
    endOfDaySetAt: z.string().nullable().catch(null),
  })
  .catch(ONBOARDING_DEFAULTS);

/* Compile-time guarantee that schema output and interface never drift. */
const _schemaMatchesInterface: OnboardingState = {} as z.infer<typeof onboardingStateSchema>;
const _interfaceMatchesSchema: z.infer<typeof onboardingStateSchema> = {} as OnboardingState;
void _schemaMatchesInterface;
void _interfaceMatchesSchema;
