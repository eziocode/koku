/**
 * The searchable index of every settings section and control.
 *
 * Deliberately pure data: no React, no lucide, no imports at all. That keeps it
 * usable from `node:test` without a JSX loader, and lets the settings hub, the
 * command palette, and the dashboard tips share one source of truth for what a
 * setting is called and where it lives.
 *
 * `kind` maps to an icon in the UI layer, not here.
 */

/** Query param that asks a settings page to scroll to and flash one control. */
export const HIGHLIGHT_PARAM = "highlight";

export interface SettingsSectionMeta {
  id: string;
  title: string;
  description: string;
  /** Route that renders this section's controls. */
  href: string;
  /** Which hub page shows this card. */
  hub: "root" | "notifications";
  /** Renders a beta badge on the section card. */
  beta?: boolean;
  /** Search synonyms the title and description do not already contain. */
  keywords?: readonly string[];
}

export interface SettingsEntry {
  /** DOM id of the control, and the `?highlight=` value. Unique across the app. */
  anchorId: string;
  sectionId: string;
  /** Must match the control's rendered label verbatim. */
  label: string;
  /** The control's helper text; "" when it has none. */
  description: string;
  /** Search synonyms the label and description do not already contain. */
  keywords?: readonly string[];
  /** Drives the result-row affordance only. */
  kind: "toggle" | "select" | "input" | "action" | "group";
}

export const SETTINGS_SECTIONS = [
  {
    id: "appearance",
    title: "Appearance",
    description: "Choose your theme (light, dark, system) and accent colour.",
    href: "/settings/appearance",
    hub: "root",
    keywords: ["dark mode", "light mode", "colour", "color", "accent", "theme"],
  },
  {
    id: "notifications",
    title: "Notifications",
    description:
      "Check-ins, quiet hours & schedule, breaks, and end of day, in four focused sections.",
    href: "/settings/notifications",
    hub: "root",
    keywords: ["alerts", "reminders", "push"],
  },
  {
    id: "quick-actions",
    title: "Quick actions",
    description:
      "Custom one-click buttons for calls, standups, and anything else you track live.",
    href: "/settings/quick-actions",
    hub: "root",
    keywords: ["shortcut buttons", "presets"],
  },
  {
    id: "mini-player",
    title: "Mini player",
    description: "A floating always-on-top timer that stays visible across tabs.",
    href: "/settings/mini-player",
    hub: "root",
    keywords: ["popout", "floating window", "always on top", "pip"],
  },
  {
    id: "account",
    title: "Account & Profile",
    description: "Personalize your display name and manage your Zoho account.",
    href: "/settings/account",
    hub: "root",
    keywords: ["sign out", "log out", "profile", "name", "zoho"],
  },
  {
    id: "projects",
    title: "Projects",
    description: "Manage project colors, rates, and categories for local tracking.",
    href: "/settings/projects",
    hub: "root",
    keywords: ["clients", "billing rate", "categories"],
  },
  {
    id: "ai-keys",
    title: "AI Keys",
    description: "Store provider credentials locally for AI workflows.",
    href: "/settings/ai-keys",
    hub: "root",
    beta: true,
    keywords: ["api key", "openai", "anthropic", "credentials", "token"],
  },
  {
    id: "storage",
    title: "Storage",
    description: "Export, import, and prepare for optional cloud drive sync.",
    href: "/settings/storage",
    hub: "root",
    keywords: ["backup", "export", "import", "sync", "data", "csv", "json"],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    description:
      "Jump around and act on timers and breaks without leaving the keyboard.",
    href: "/settings/shortcuts",
    hub: "root",
    keywords: ["hotkeys", "keybindings", "keys"],
  },
  {
    id: "check-ins",
    title: "Check-in reminders",
    description:
      "The master switch, cadence, and which buttons appear on the notification.",
    href: "/settings/notifications/check-ins",
    hub: "notifications",
    keywords: ["nudge", "how often", "interval", "cadence"],
  },
  {
    id: "schedule",
    title: "Quiet hours & schedule",
    description: "Do not disturb, a daily quiet window, silent weekdays, and holidays.",
    href: "/settings/notifications/schedule",
    hub: "notifications",
    keywords: ["dnd", "do not disturb", "leave", "holiday", "weekend", "silent"],
  },
  {
    id: "breaks",
    title: "Breaks",
    description: "The break button, preset lengths, and what happens when a break ends.",
    href: "/settings/notifications/breaks",
    hub: "notifications",
    keywords: ["pause", "lunch", "coffee", "pomodoro"],
  },
  {
    id: "end-of-day",
    title: "End of day",
    description: "Auto-stop running timers at your logoff time.",
    href: "/settings/notifications/end-of-day",
    hub: "notifications",
    keywords: ["logoff", "log off", "sign off", "auto-stop", "grace period", "eod"],
  },
  {
    id: "sound",
    title: "Sound",
    description: "The chime reminders play when they fire, and its volume.",
    href: "/settings/notifications/sound",
    hub: "notifications",
    keywords: ["chime", "audio", "volume", "mute", "beep", "ping"],
  },
] as const satisfies readonly SettingsSectionMeta[];

export const SETTINGS_ENTRIES = [
  // ── Check-in reminders ───────────────────────────────────────────────────
  {
    anchorId: "notifications-enabled",
    sectionId: "check-ins",
    label: "Check-in reminders",
    description: "The master switch. With this off, koku schedules nothing at all.",
    keywords: ["master switch", "turn off all"],
    kind: "toggle",
  },
  {
    anchorId: "checkin-enabled",
    sectionId: "check-ins",
    label: "Send check-ins",
    description: "Turn off to keep breaks and do-not-disturb without the recurring nudge.",
    keywords: ["nudge"],
    kind: "toggle",
  },
  {
    anchorId: "checkin-interval",
    sectionId: "check-ins",
    label: "Interval",
    description: "How often a check-in fires.",
    keywords: ["how often", "cadence", "frequency", "every 30 minutes"],
    kind: "select",
  },
  {
    anchorId: "checkin-custom",
    sectionId: "check-ins",
    label: "Custom interval",
    description: "Set your own number of minutes between check-ins.",
    keywords: ["custom minutes", "how often"],
    kind: "input",
  },
  {
    anchorId: "checkin-require-interaction",
    sectionId: "check-ins",
    label: "Keep in the notification centre",
    description:
      "Overrides auto-hide and stays until you act on it. Chrome and Edge on desktop only.",
    keywords: ["sticky", "persistent"],
    kind: "toggle",
  },
  {
    anchorId: "checkin-auto-hide",
    sectionId: "check-ins",
    label: "Auto-hide after",
    description: "How long a check-in stays on screen before the browser dismisses it.",
    keywords: ["dismiss", "timeout", "duration"],
    kind: "select",
  },
  {
    anchorId: "checkin-idle",
    sectionId: "check-ins",
    label: "Remind me when nothing is tracked",
    description: "Nudges you to start a timer when none is running.",
    keywords: ["idle", "no timer running"],
    kind: "toggle",
  },
  {
    anchorId: "action-quick-note",
    sectionId: "check-ins",
    label: "Quick note",
    description:
      "Opens a single-field composer that appends a timestamped note to what’s running.",
    keywords: ["notification button"],
    kind: "toggle",
  },
  {
    anchorId: "action-open-log",
    sectionId: "check-ins",
    label: "Open log",
    description: "Jumps to your time log.",
    keywords: ["notification button"],
    kind: "toggle",
  },
  {
    anchorId: "action-dismiss",
    sectionId: "check-ins",
    label: "Dismiss",
    description: "An explicit way to clear the check-in.",
    keywords: ["notification button"],
    kind: "toggle",
  },

  // ── Quiet hours & schedule ───────────────────────────────────────────────
  {
    anchorId: "dnd-controls",
    sectionId: "schedule",
    label: "Do not disturb",
    description:
      "Silences check-ins without changing anything else, for a stretch you choose.",
    keywords: ["dnd", "mute", "snooze", "silence"],
    kind: "action",
  },
  {
    anchorId: "quiet-hours-enabled",
    sectionId: "schedule",
    label: "Use quiet hours",
    description: "Off by default, so it changes nothing until you want it.",
    keywords: ["quiet window", "night"],
    kind: "toggle",
  },
  {
    anchorId: "quiet-hours-auto",
    sectionId: "schedule",
    label: "Adapt to my activity",
    description:
      "Recomputed from your last 30 days of logs instead of a fixed time. Needs at least 5 logged days.",
    keywords: ["automatic quiet hours", "learn"],
    kind: "toggle",
  },
  {
    anchorId: "quiet-start",
    sectionId: "schedule",
    label: "Quiet hours start",
    description: "When the daily quiet window opens.",
    keywords: ["from", "start time"],
    kind: "input",
  },
  {
    anchorId: "quiet-end",
    sectionId: "schedule",
    label: "Quiet hours end",
    description: "When the daily quiet window closes.",
    keywords: ["until", "end time"],
    kind: "input",
  },
  {
    anchorId: "silent-days",
    sectionId: "schedule",
    label: "Silent days",
    description: "Check-ins are skipped entirely on the selected days of the week.",
    keywords: ["weekend", "saturday", "sunday", "weekday"],
    kind: "group",
  },
  {
    anchorId: "holiday-dates",
    sectionId: "schedule",
    label: "Holidays",
    description: "Mark a specific day off. Every notification for that day is skipped.",
    keywords: ["day off", "public holiday", "mark today"],
    kind: "group",
  },
  {
    anchorId: "leave-dates",
    sectionId: "schedule",
    label: "Planned leave",
    description:
      "Mark days you’ll be away, including upcoming ones. Notifications are skipped the same as a holiday.",
    keywords: ["vacation", "holiday request", "pto", "time off", "away"],
    kind: "group",
  },

  // ── Breaks ───────────────────────────────────────────────────────────────
  {
    anchorId: "breaks-enabled",
    sectionId: "breaks",
    label: "Show the break button",
    description: "Turn off to hide breaks entirely.",
    keywords: ["pause button"],
    kind: "toggle",
  },
  {
    anchorId: "breaks-auto-resume",
    sectionId: "breaks",
    label: "Resume timers afterwards",
    description: "Picks your paused timers back up when the break ends.",
    keywords: ["auto resume", "restart"],
    kind: "toggle",
  },
  {
    anchorId: "breaks-notify",
    sectionId: "breaks",
    label: "Notify me when a break ends",
    description: "Needs check-in reminders to be allowed above.",
    keywords: ["break over", "alert"],
    kind: "toggle",
  },
  {
    anchorId: "breaks-block",
    sectionId: "breaks",
    label: "Block new timers during a break",
    description: "Keeps a break honest. Turn off if you want to start tracking mid-break.",
    keywords: ["prevent tracking"],
    kind: "toggle",
  },
  {
    anchorId: "break-presets",
    sectionId: "breaks",
    label: "Preset lengths (minutes)",
    description: "The break durations offered as one-click options.",
    keywords: ["5 minutes", "15 minutes", "lunch", "duration"],
    kind: "input",
  },

  // ── End of day ───────────────────────────────────────────────────────────
  {
    anchorId: "eod-enabled",
    sectionId: "end-of-day",
    label: "Auto-stop at end of day",
    description: "Requires notifications to be allowed above.",
    // No "logoff" here: it belongs to eod-logoff-time, which is the control
    // someone searching that word is actually after.
    keywords: ["auto stop", "forgot to stop", "end of day"],
    kind: "toggle",
  },
  {
    anchorId: "eod-logoff-time",
    sectionId: "end-of-day",
    label: "Logoff time",
    description: "The time koku treats as the end of your working day.",
    keywords: ["logoff", "log off", "sign off", "home time", "clock out"],
    kind: "input",
  },
  {
    anchorId: "eod-grace-period",
    sectionId: "end-of-day",
    label: "Grace period",
    description: "How long you get to answer before a running timer is stopped for you.",
    keywords: ["delay", "wait", "before stopping"],
    kind: "select",
  },

  // ── Sound ────────────────────────────────────────────────────────────────
  {
    anchorId: "sound-enabled",
    sectionId: "sound",
    label: "Play a sound for reminders",
    description: "Turn off to silence reminder sound-fx entirely.",
    keywords: ["chime", "mute", "audio", "beep"],
    kind: "toggle",
  },
  {
    anchorId: "sound-volume",
    sectionId: "sound",
    label: "Volume",
    description: "How loud the reminder chime plays.",
    keywords: ["loudness", "quieter", "louder"],
    kind: "input",
  },
  {
    anchorId: "reminder-beep-seconds",
    sectionId: "sound",
    label: "Reminder alarm length",
    description: "How long the reminder chime keeps sounding.",
    keywords: ["beep", "duration", "how long"],
    kind: "select",
  },

  // ── Appearance ───────────────────────────────────────────────────────────
  {
    anchorId: "appearance-theme",
    sectionId: "appearance",
    label: "Theme",
    description: "Choose how Koku looks on this device.",
    keywords: ["dark mode", "light mode", "system", "night mode"],
    kind: "group",
  },
  {
    anchorId: "appearance-time-format",
    sectionId: "appearance",
    label: "Time format",
    description: "Use 12-hour or 24-hour time across Koku.",
    keywords: ["24 hour", "12 hour", "am pm", "clock"],
    kind: "group",
  },
  {
    anchorId: "entry-notes-display",
    sectionId: "appearance",
    label: "Show notes by default",
    description:
      "Off shows a note count you expand on demand, instead of the full text.",
    keywords: ["expand notes", "collapse notes"],
    kind: "toggle",
  },
  {
    anchorId: "appearance-accent",
    sectionId: "appearance",
    label: "Accent colour",
    description:
      "Sets the primary interactive colour across the whole app. Saved locally on this device.",
    keywords: ["accent color", "theme colour", "purple", "teal", "palette"],
    kind: "group",
  },
  {
    anchorId: "appearance-surface",
    sectionId: "appearance",
    label: "Surface style",
    description: "Sets the page and panel colours. One choice covers both light and dark.",
    keywords: [
      "dark mode style",
      "warm",
      "cool",
      "blue gray",
      "graphite",
      "oled",
      "pure black",
      "contrast",
      "palette",
      "background colour",
    ],
    kind: "group",
  },
  {
    anchorId: "appearance-font",
    sectionId: "appearance",
    label: "Font style",
    description:
      "Sets the typefaces for headings, body text, and timer digits. All are bundled with the app, so they work offline.",
    keywords: [
      "font",
      "typeface",
      "typography",
      "serif",
      "inter",
      "manrope",
      "geist",
      "plex",
      "text size",
    ],
    kind: "group",
  },

  // ── Mini player ──────────────────────────────────────────────────────────
  {
    anchorId: "mini-player-enabled",
    sectionId: "mini-player",
    label: "Offer the mini player",
    description: "Shows the pop-out button. Nothing opens on its own because of this.",
    keywords: ["popout", "floating timer"],
    kind: "toggle",
  },
  {
    anchorId: "mini-player-auto-open",
    sectionId: "mini-player",
    label: "Open it when I start a timer",
    description:
      "Browsers only allow this window to open in response to a click, and starting a timer is the one reliable moment. Worth knowing: your browser gives the new window focus, so this pulls focus away the instant you hit start.",
    keywords: ["automatic", "auto open"],
    kind: "toggle",
  },
  {
    anchorId: "mini-player-auto-open-tab-switch",
    sectionId: "mini-player",
    label: "Follow me when I switch tabs",
    description:
      "Pops the player out when you leave koku while something is being tracked, and folds it away when you come back. It never opens with nothing running. Chrome only allows this for installed apps. Add koku to your dock or taskbar and it works everywhere.",
    keywords: ["tab switch", "follow"],
    kind: "toggle",
  },

  // ── Quick actions ────────────────────────────────────────────────────────
  {
    anchorId: "quick-actions-enabled",
    sectionId: "quick-actions",
    label: "Show quick action buttons",
    description: "Turn off to hide them entirely.",
    keywords: ["one click", "presets"],
    kind: "toggle",
  },
] as const satisfies readonly SettingsEntry[];

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
export type SettingsAnchorId = (typeof SETTINGS_ENTRIES)[number]["anchorId"];

export const SETTINGS_SECTIONS_BY_ID: Record<string, SettingsSectionMeta> =
  Object.fromEntries(SETTINGS_SECTIONS.map((section) => [section.id, section]));

export const SETTINGS_ENTRIES_BY_ANCHOR: Record<string, SettingsEntry> =
  Object.fromEntries(SETTINGS_ENTRIES.map((entry) => [entry.anchorId, entry]));

export function sectionsForHub(hub: SettingsSectionMeta["hub"]): SettingsSectionMeta[] {
  return SETTINGS_SECTIONS.filter((section) => section.hub === hub);
}

export function entriesForSection(sectionId: string): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.sectionId === sectionId);
}

/** Deep link that lands on the control and flashes it once. */
export function settingHref(entry: SettingsEntry): string {
  const section = SETTINGS_SECTIONS_BY_ID[entry.sectionId];
  return `${section.href}?${HIGHLIGHT_PARAM}=${entry.anchorId}`;
}

export function isSettingsAnchorId(value: string): value is SettingsAnchorId {
  return Object.hasOwn(SETTINGS_ENTRIES_BY_ANCHOR, value);
}
