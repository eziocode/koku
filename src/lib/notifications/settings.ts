import { z } from "zod";

/* ─── Tags ────────────────────────────────────────────────────────────────── */
/* Applied to the `TimeEntry.tags` array so breaks and standalone quick notes    */
/* can be excluded from work totals without a schema change. Reports filter on   */
/* these — see `buildSegmentedDays({ excludeTags })` in `src/lib/charts/segments.ts`. */

export const BREAK_TAG = "break";
export const QUICK_NOTE_TAG = "quick-note";

/* ─── Interval bounds ─────────────────────────────────────────────────────── */
/* The 5-minute floor is not cosmetic. Hidden tabs are throttled to roughly one  */
/* timer wake per minute (and may be frozen outright), so koku cannot honestly   */
/* promise finer granularity than a few minutes while it is in the background.   */

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 480;

/** Offered in the settings dropdown; any value in range is still accepted. */
export const INTERVAL_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120] as const;
export const AUTO_HIDE_PRESETS = [1, 2, 5, 10, 30, 60] as const;

export type DndMode = "off" | "until" | "indefinite";

/* ─── Preferences ─────────────────────────────────────────────────────────── */
/* The shape is nested to mirror the settings-page cards 1:1, so each card is a  */
/* single `patchValue` call. Stored as ONE Dexie `settings` row (key            */
/* "notifications") rather than ~15 rows: `liveQuery` re-runs on any settings    */
/* change anyway, so splitting buys no granularity, and a read-modify-write      */
/* inside a Dexie `rw` transaction is serialized across tabs by IndexedDB.       */

export interface NotificationPreferences {
  version: 1;
  /** Master switch. Off by default — the entire feature is opt-in. */
  enabled: boolean;
  checkIn: {
    enabled: boolean;
    intervalMinutes: number;
    /** Minutes before a non-sticky browser notification is closed. */
    autoHideMinutes: number;
    /** Keeps the notification in the tray until acted on. Chrome/Edge desktop only. */
    requireInteraction: boolean;
    /** Also nudge when nothing is being tracked at all. */
    notifyWhenIdle: boolean;
    actions: {
      quickNote: boolean;
      openLog: boolean;
      dismiss: boolean;
    };
  };
  dnd: {
    mode: DndMode;
    /** Absolute expiry for `mode: "until"`; ignored otherwise. */
    untilIso: string | null;
  };
  quietHours: {
    enabled: boolean;
    /** Minutes from local midnight. May wrap past midnight (start > end). */
    startMinute: number;
    endMinute: number;
  };
  breaks: {
    enabled: boolean;
    presetMinutes: number[];
    defaultMinutes: number;
    /** Resume the timers the break paused when it completes. */
    autoResume: boolean;
    notifyOnComplete: boolean;
    /** Refuse to start new timers while a break is running. */
    blockNewTimers: boolean;
  };
  endOfDay: {
    /** Master switch for the end-of-day auto-stop feature. */
    enabled: boolean;
    /** 24-hour "HH:MM" string — when to fire the wrap-up notification. */
    logoffTime: string;
    /** Minutes after the notification fires before timers are stopped automatically. */
    gracePeriodMinutes: number;
  };
  /** Days of the week on which all check-in notifications are silenced.
   *  0 = Sunday, 1 = Monday, …, 6 = Saturday. Empty array = no silent days. */
  silentDays: number[];
}

export const NOTIFICATION_DEFAULTS: NotificationPreferences = {
  version: 1,
  enabled: false,
  checkIn: {
    enabled: true,
    intervalMinutes: 30,
    requireInteraction: false,
    autoHideMinutes: 1,
    notifyWhenIdle: true,
    actions: { quickNote: true, openLog: true, dismiss: true },
  },
  dnd: { mode: "off", untilIso: null },
  quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 8 * 60 },
  breaks: {
    enabled: true,
    presetMinutes: [5, 10, 15, 30],
    defaultMinutes: 10,
    autoResume: true,
    notifyOnComplete: true,
    blockNewTimers: true,
  },
  endOfDay: {
    enabled: false,
    logoffTime: "18:00",
    gracePeriodMinutes: 15,
  },
  silentDays: [],
};

/* ─── Schema ──────────────────────────────────────────────────────────────── */
/* Every field carries `.catch()` so a partial or corrupt row upgrades field by  */
/* field instead of resetting the whole blob, and the outer object catches too   */
/* so a completely unparseable value still yields usable defaults.               */

const minutesInDay = 24 * 60;

export const notificationPreferencesSchema = z
  .object({
    version: z.literal(1).catch(1),
    enabled: z.boolean().catch(NOTIFICATION_DEFAULTS.enabled),
    checkIn: z
      .object({
        enabled: z.boolean().catch(NOTIFICATION_DEFAULTS.checkIn.enabled),
        intervalMinutes: z
          .number()
          .int()
          .min(MIN_INTERVAL_MINUTES)
          .max(MAX_INTERVAL_MINUTES)
          .catch(NOTIFICATION_DEFAULTS.checkIn.intervalMinutes),
        autoHideMinutes: z
          .number()
          .int()
          .min(1)
          .max(60)
          .catch(NOTIFICATION_DEFAULTS.checkIn.autoHideMinutes),
        requireInteraction: z.boolean().catch(NOTIFICATION_DEFAULTS.checkIn.requireInteraction),
        notifyWhenIdle: z.boolean().catch(NOTIFICATION_DEFAULTS.checkIn.notifyWhenIdle),
        actions: z
          .object({
            quickNote: z.boolean().catch(true),
            openLog: z.boolean().catch(true),
            dismiss: z.boolean().catch(true),
          })
          .catch(NOTIFICATION_DEFAULTS.checkIn.actions),
      })
      .catch(NOTIFICATION_DEFAULTS.checkIn),
    dnd: z
      .object({
        mode: z.enum(["off", "until", "indefinite"]).catch("off"),
        untilIso: z.string().nullable().catch(null),
      })
      .catch(NOTIFICATION_DEFAULTS.dnd),
    quietHours: z
      .object({
        enabled: z.boolean().catch(false),
        startMinute: z.number().int().min(0).max(minutesInDay - 1).catch(NOTIFICATION_DEFAULTS.quietHours.startMinute),
        endMinute: z.number().int().min(0).max(minutesInDay - 1).catch(NOTIFICATION_DEFAULTS.quietHours.endMinute),
      })
      .catch(NOTIFICATION_DEFAULTS.quietHours),
    breaks: z
      .object({
        enabled: z.boolean().catch(true),
        presetMinutes: z
          .array(z.number().int().min(1).max(240))
          .min(1)
          .catch(NOTIFICATION_DEFAULTS.breaks.presetMinutes),
        defaultMinutes: z.number().int().min(1).max(240).catch(NOTIFICATION_DEFAULTS.breaks.defaultMinutes),
        autoResume: z.boolean().catch(true),
        notifyOnComplete: z.boolean().catch(true),
        blockNewTimers: z.boolean().catch(true),
      })
      .catch(NOTIFICATION_DEFAULTS.breaks),
    endOfDay: z
      .object({
        enabled: z.boolean().catch(false),
        logoffTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .catch(NOTIFICATION_DEFAULTS.endOfDay.logoffTime),
        gracePeriodMinutes: z.number().int().min(5).max(60).catch(NOTIFICATION_DEFAULTS.endOfDay.gracePeriodMinutes),
      })
      .catch(NOTIFICATION_DEFAULTS.endOfDay),
    silentDays: z
      .array(z.number().int().min(0).max(6))
      .catch([]),
  })
  .catch(NOTIFICATION_DEFAULTS);

/* Compile-time guarantee that the schema output and the hand-written interface
   never drift apart. Assigning each to the other checks both directions. */
const _schemaMatchesInterface: NotificationPreferences =
  {} as z.infer<typeof notificationPreferencesSchema>;
const _interfaceMatchesSchema: z.infer<typeof notificationPreferencesSchema> =
  {} as NotificationPreferences;
void _schemaMatchesInterface;
void _interfaceMatchesSchema;

/* ─── Pure helpers ────────────────────────────────────────────────────────── */

/** Clamps into the honourable range. Non-finite input falls back to the default. */
export function clampIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return NOTIFICATION_DEFAULTS.checkIn.intervalMinutes;
  }

  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(value)));
}

export function isValidIntervalMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_INTERVAL_MINUTES &&
    value <= MAX_INTERVAL_MINUTES
  );
}
