/**
 * Discovery tips shown on the dashboard.
 *
 * The card they render in used to read "Quick action — Start a timer below",
 * which restated a button sitting directly underneath it. This list replaces
 * that dead space with the thing a new user actually lacks: knowing which parts
 * of koku exist. Each tip names one capability and links straight to it, so the
 * card is a way in rather than a caption.
 *
 * Pure data, no React: the rotation lives in the component, and the list is
 * imported by tests to assert every `href` resolves to a real route.
 */

export interface DashboardTip {
  id: string;
  /** Short area label — the page or settings card the tip belongs to. */
  area: string;
  text: string;
  /** In-app destination. Every value must be a route this build serves. */
  href: string;
  actionLabel: string;
}

export const DASHBOARD_TIPS: DashboardTip[] = [
  {
    id: "parallel-tasks",
    area: "Live timer",
    text: "Pause every running timer and a “parallel task” panel appears, track a second thread of work without losing the first.",
    href: "/dashboard",
    actionLabel: "Try it below",
  },
  {
    id: "pomodoro",
    area: "Live timer",
    text: "Flip on Pomodoro mode before starting to tag a session as a focused cycle, then filter on it later.",
    href: "/dashboard",
    actionLabel: "Try it below",
  },
  {
    id: "breaks",
    area: "Breaks",
    text: "Taking a break pauses your timers and logs itself separately, so break time never inflates your work total.",
    href: "/settings/notifications",
    actionLabel: "Tune breaks",
  },
  {
    id: "manual-entry",
    area: "Time log",
    text: "Forgot to hit start? Add a manual entry for any past time block, pick the day first and the form follows it.",
    href: "/log",
    actionLabel: "Open the log",
  },
  {
    id: "compare-days",
    area: "Time log",
    text: "Compare mode puts two days side by side, so you can see what actually changed between them.",
    href: "/log?compare=1",
    actionLabel: "Compare days",
  },
  {
    id: "export",
    area: "Time log",
    text: "Export any filtered view as CSV, or as a four-sheet XLSX workbook for whoever asks for the numbers.",
    href: "/log",
    actionLabel: "Open the log",
  },
  {
    id: "notes",
    area: "Notes",
    text: "Notes is a full rich-text editor (code blocks, images, links) and quick notes land there automatically.",
    href: "/notes",
    actionLabel: "Open notes",
  },
  {
    id: "graph",
    area: "Graph",
    text: "The graph links your notes and projects together, so you can see how one piece of work touches another.",
    href: "/graph",
    actionLabel: "Open the graph",
  },
  {
    id: "reports",
    area: "Reports",
    text: "Reports break your time down by project, category, and tag over any range you choose.",
    href: "/reports",
    actionLabel: "Open reports",
  },
  {
    id: "ai",
    area: "AI",
    text: "Bring your own API key and ask questions about your own logged time. Nothing leaves without your key.",
    href: "/ai",
    actionLabel: "Open AI",
  },
  {
    id: "mini-player",
    area: "Mini player",
    text: "Pop the timer out into a small always-on-top window and keep tracking while you work elsewhere.",
    href: "/settings/mini-player",
    actionLabel: "Mini player settings",
  },
  {
    id: "check-ins",
    area: "Notifications",
    text: "Recurring check-ins nudge you to log what you are doing, with a quick-note button right on the notification.",
    href: "/settings/notifications",
    actionLabel: "Set up check-ins",
  },
  {
    id: "holidays",
    area: "Notifications",
    text: "Mark a day as a holiday and every notification for it is skipped, check-ins and the end-of-day wrap-up alike.",
    href: "/settings/notifications",
    actionLabel: "Mark a holiday",
  },
  {
    id: "quiet-hours",
    area: "Notifications",
    text: "Quiet hours and silent days silence check-ins on a schedule, without switching the feature off.",
    href: "/settings/notifications",
    actionLabel: "Set quiet hours",
  },
  {
    id: "end-of-day",
    area: "Notifications",
    text: "End-of-day auto-stop catches the timer you forgot to stop, after a grace period you choose.",
    href: "/settings/notifications",
    actionLabel: "Set your logoff time",
  },
  {
    id: "appearance",
    area: "Appearance",
    text: "Themes, accent colour, and 12- or 24-hour clocks all live under Appearance.",
    href: "/settings/appearance",
    actionLabel: "Open appearance",
  },
  {
    id: "projects",
    area: "Projects",
    text: "Give a project an hourly rate and every report can show what the time was worth.",
    href: "/settings/projects",
    actionLabel: "Manage projects",
  },
  {
    id: "storage",
    area: "Storage",
    text: "Your data is local-first. Export a full backup, or import one, from Storage settings.",
    href: "/settings/storage",
    actionLabel: "Open storage",
  },
  {
    id: "tags",
    area: "Tags",
    text: "Tags are free-form and suggest themselves from what you have used before, handy for cross-project themes.",
    href: "/reports",
    actionLabel: "See tag breakdown",
  },
  {
    id: "week-chart",
    area: "Dashboard",
    text: "Every block in “This week” is one log, hover it for the detail, click it to open that day.",
    href: "/dashboard",
    actionLabel: "See this week",
  },
];

/**
 * Picks a start position without `Math.random()` in render.
 *
 * Called from an effect after mount so the server and client first paint agree;
 * randomising during render would be a hydration mismatch.
 */
export function pickRandomTipIndex(total = DASHBOARD_TIPS.length): number {
  if (total <= 0) {
    return 0;
  }

  return Math.floor(Math.random() * total) % total;
}
