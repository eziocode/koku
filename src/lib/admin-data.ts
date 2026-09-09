import type { SegmentSourceEntry } from "@/lib/charts/segments";
import type { NotificationPreferences } from "@/lib/notifications/settings";
import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";
import { buildTagTotals, type TagTotal } from "@/lib/time-tracking/tag-stats";

export type AdminRow = Record<string, unknown>;

export type AdminUser = { id: string; email: string; displayName: string; presence?: AdminPresence };
export type AdminGroup = { id: string; name: string; userIds: string[] };
export type CatalystUserDetails = {
  user_id?: string | number;
  email_id?: string;
  first_name?: string;
  last_name?: string;
};

function normalizedUserId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  return id || null;
}

/** Extract and normalize Catalyst ownership from any supported row shape. */
export function extractCatalystRowUserId(raw: AdminRow, table?: string): string | null {
  const nested = table && raw[table] && typeof raw[table] === "object"
    ? raw[table] as AdminRow
    : null;
  const candidates = [
    nested?.user_id,
    table ? nested?.[`${table}.user_id`] : undefined,
    raw.user_id,
    raw.userId,
    table ? raw[`${table}.user_id`] : undefined,
    ...Object.entries(raw)
      .filter(([key]) => key.endsWith(".user_id"))
      .map(([, value]) => value),
    ...(nested ? Object.entries(nested)
      .filter(([key]) => key.endsWith(".user_id"))
      .map(([, value]) => value) : []),
  ];
  for (const candidate of candidates) {
    const id = normalizedUserId(candidate);
    if (id) return id;
  }
  return null;
}

/** Map Catalyst user detail response to identity used by admin UI. */
export function adminUserFromDetails(details: CatalystUserDetails): AdminUser | null {
  const id = String(details.user_id ?? "").trim();
  if (!id) return null;
  const email = String(details.email_id ?? "").trim();
  const displayName = `${details.first_name ?? ""} ${details.last_name ?? ""}`.trim();
  return { id, email, displayName };
}
export interface AdminStats {
  totalTrackedDuration: number;
  timeEntryCount: number;
  activeDays: number;
  firstActivity: string | null;
  latestActivity: string | null;
  projectCount: number;
  categoryCount: number;
  noteCount: number;
  taskCount: number;
  openTaskCount: number;
  /** Time logged under the break tag, kept apart from `totalTrackedDuration`. */
  breakSeconds: number;
  /** Sum of every task's own stopwatch, independent of linked time entries. */
  taskAccruedSec: number;
  reminderCount: number;
  notificationCount: number;
  noteLinkCount: number;
  /** Entries with no end recorded, i.e. a timer still running. */
  runningEntryCount: number;
}

/**
 * The slice of a user's notification settings an admin is allowed to see.
 *
 * Deliberately an explicit pick rather than a spread of `NotificationPreferences`:
 * a field added to that interface later must be opted in here before it reaches
 * an admin, not leak by default.
 */
export type AdminWorkSchedule = {
  /** Whether the user has notifications switched on at all. */
  enabled: boolean;
  holidayDates: string[];
  leaveDates: string[];
  /** Weekday indices treated as recurring days off, 0 = Sunday. */
  silentDays: number[];
  quietHours: { enabled: boolean; startMinute: number; endMinute: number };
  endOfDay: { enabled: boolean; logoffTime: string; gracePeriodMinutes: number };
  checkIn: { enabled: boolean; intervalMinutes: number };
  breaks: { enabled: boolean; defaultMinutes: number; presetMinutes: number[] };
};

/** Narrow a user's full notification preferences to the admin-visible fields. */
export function pickAdminWorkSchedule(prefs: NotificationPreferences): AdminWorkSchedule {
  return {
    enabled: prefs.enabled,
    holidayDates: [...prefs.holidayDates],
    leaveDates: [...prefs.leaveDates],
    silentDays: [...prefs.silentDays],
    quietHours: {
      enabled: prefs.quietHours.enabled,
      startMinute: prefs.quietHours.startMinute,
      endMinute: prefs.quietHours.endMinute,
    },
    endOfDay: {
      enabled: prefs.endOfDay.enabled,
      logoffTime: prefs.endOfDay.logoffTime,
      gracePeriodMinutes: prefs.endOfDay.gracePeriodMinutes,
    },
    checkIn: {
      enabled: prefs.checkIn.enabled,
      intervalMinutes: prefs.checkIn.intervalMinutes,
    },
    breaks: {
      enabled: prefs.breaks.enabled,
      defaultMinutes: prefs.breaks.defaultMinutes,
      presetMinutes: [...prefs.breaks.presetMinutes],
    },
  };
}

export type AdminPresence = {
  seenAt: string;
  visible: boolean;
  focused: boolean;
  work?: { title: string; startedAt: string } | null;
  break?: { label: string; startedAt: string } | null;
};

export type PresenceStatus = "working" | "break" | "online" | "offline";

/** Active users first, newest heartbeat first, inactive users last. */
export function sortAdminUsersByPresence(users: AdminUser[], now = Date.now()): AdminUser[] {
  return [...users].sort((a, b) => {
    const aStatus = getPresenceStatus(a.presence, now);
    const bStatus = getPresenceStatus(b.presence, now);
    const aActive = aStatus === "offline" ? 0 : 1;
    const bActive = bStatus === "offline" ? 0 : 1;
    if (aActive !== bActive) return bActive - aActive;

    const aSeen = validDate(a.presence?.seenAt)?.getTime() ?? 0;
    const bSeen = validDate(b.presence?.seenAt)?.getTime() ?? 0;
    if (aSeen !== bSeen) return bSeen - aSeen;
    return (a.displayName || a.email).localeCompare(b.displayName || b.email);
  });
}

export type DashboardData = {
  workEntries: AdminRow[];
  breakEntries: AdminRow[];
  notes: AdminRow[];
  totalSeconds: number;
  todaySeconds: number;
  activeDays: number;
  daily: Array<{ day: string; seconds: number }>;
  projects: Array<{ id: string; name: string; color: string; seconds: number }>;
  /** Same split as `projects`, but by category. Unassigned work is folded in. */
  categories: Array<{ id: string; name: string; color: string; seconds: number }>;
  /** Every tag used in the range, ranked by tracked time. */
  tags: TagTotal[];
  /** Time under the break tag. Reported alongside work, never inside it. */
  breakSeconds: number;
  lastActivity: string | null;
};

function validDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: unknown) {
  const date = validDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null;
}

function isBreak(row: AdminRow) {
  return Array.isArray(row.tags) && row.tags.some((tag) => String(tag).toLowerCase() === "break");
}

export function dashboardForRange(rows: AdminRow[], start: string, end: string, today = new Date()): DashboardData {
  const from = validDate(start)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const until = validDate(end)?.getTime() ?? Number.POSITIVE_INFINITY;
  const entries = rows.filter((row) => row.table === "timeEntries");
  const notes = rows.filter((row) => row.table === "notes").filter((row) => {
    const date = validDate(row.updatedAt ?? row.createdAt);
    return Boolean(date && date.getTime() >= from && date.getTime() <= until);
  });
  const inRange = entries.filter((row) => {
    const date = validDate(row.startAt ?? row.createdAt);
    return Boolean(date && date.getTime() >= from && date.getTime() <= until);
  });
  const breakEntries = inRange.filter(isBreak);
  const workEntries = inRange.filter((row) => !isBreak(row));
  const dailyMap = new Map<string, number>();
  const projectMap = new Map<string, { id: string; name: string; color: string; seconds: number }>();
  const categoryMap = new Map<string, { id: string; name: string; color: string; seconds: number }>();
  const projects = new Map(rows.filter((row) => row.table === "projects").map((row) => [String(row.id), row]));
  const categories = new Map(rows.filter((row) => row.table === "categories").map((row) => [String(row.id), row]));
  let totalSeconds = 0;
  const todayKey = dateKey(today.toISOString());
  let todaySeconds = 0;
  for (const row of workEntries) {
    const seconds = Math.max(0, Number(row.durationSec) || 0);
    const day = dateKey(row.startAt ?? row.createdAt);
    if (!day) continue;
    totalSeconds += seconds;
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + seconds);
    if (day === todayKey) todaySeconds += seconds;
    const id = String(row.projectId ?? "unassigned");
    const project = projects.get(id);
    const old = projectMap.get(id) ?? { id, name: String(project?.name ?? "Unassigned"), color: String(project?.color ?? "#94a3b8"), seconds: 0 };
    old.seconds += seconds;
    projectMap.set(id, old);
    const categoryId = String(row.categoryId ?? "unassigned");
    const category = categories.get(categoryId);
    const oldCategory = categoryMap.get(categoryId) ?? { id: categoryId, name: String(category?.name ?? "Uncategorized"), color: String(category?.color ?? "#94a3b8"), seconds: 0 };
    oldCategory.seconds += seconds;
    categoryMap.set(categoryId, oldCategory);
  }
  // Breaks are excluded from every work figure above, so they are summed here
  // instead of being dropped: a day with no work and two hours of break reads
  // very differently from a day with nothing at all.
  const breakSeconds = breakEntries.reduce((sum, row) => sum + Math.max(0, Number(row.durationSec) || 0), 0);
  const activity = [...entries, ...rows.filter((row) => row.table === "notes")].map((row) => validDate(row.updatedAt ?? row.startAt ?? row.createdAt)?.toISOString()).filter((value): value is string => Boolean(value)).sort();
  return {
    workEntries,
    breakEntries,
    notes,
    totalSeconds,
    todaySeconds,
    activeDays: dailyMap.size,
    daily: [...dailyMap].map(([day, seconds]) => ({ day, seconds })).sort((a, b) => a.day.localeCompare(b.day)),
    projects: [...projectMap.values()].sort((a, b) => b.seconds - a.seconds),
    categories: [...categoryMap.values()].sort((a, b) => b.seconds - a.seconds),
    tags: buildTagTotals(adminRowsToSegmentEntries(workEntries)),
    breakSeconds,
    lastActivity: activity.at(-1) ?? null,
  };
}

function optionalString(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Adapts untyped admin rows into the entry shape the segmented-chart transforms
 * consume.
 *
 * Admin rows arrive from two places with the same field names but no shared
 * type: the Catalyst-backed API (`TABLE_CONFIG.timeEntries.fromRow`) and the
 * local Dexie mirror. Both surface startAt/endAt/durationSec/tags, so one
 * defensive adapter serves both. Rows with an unparseable `startAt` are dropped
 * — the chart needs a real instant to bucket a slice onto a day, and this
 * mirrors the `if (!day) continue` skip `dashboardForRange` already applies.
 */
export function adminRowsToSegmentEntries(rows: AdminRow[]): SegmentSourceEntry[] {
  const entries: SegmentSourceEntry[] = [];

  rows.forEach((row, index) => {
    const startAt = optionalString(row.startAt);
    if (!startAt || !validDate(startAt)) return;

    const endAt = optionalString(row.endAt);
    const duration = Number(row.durationSec);

    entries.push({
      // Segment ids only key React nodes and the colour-variant hash, so a
      // synthetic id beats dropping an hour of real tracked work.
      id: optionalString(row.id) ?? `admin-row-${index}`,
      title: optionalString(row.title) ?? "Untitled work",
      notes: optionalString(row.notes),
      projectId: optionalString(row.projectId),
      categoryId: optionalString(row.categoryId),
      startAt,
      // A stored end that will not parse means the entry never closed cleanly;
      // null makes `deriveStatus` read it as running, which is the honest read.
      endAt: endAt && validDate(endAt) ? endAt : null,
      durationSec: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null,
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)).filter(Boolean) : [],
    });
  });

  return entries;
}

export function getPresenceStatus(presence: AdminPresence | undefined, now = Date.now()): PresenceStatus {
  if (!presence || !presence.visible || !presence.focused) return "offline";
  const seen = validDate(presence.seenAt)?.getTime() ?? 0;
  if (now - seen > 5 * 60_000) return "offline";
  if (presence.break) return "break";
  if (presence.work) return "working";
  return "online";
}

/**
 * A task's own stopwatch, read straight off an untyped admin row.
 *
 * Mirrors `getTaskAccruedSec` in `src/lib/tasks/task-time.ts`, which takes a
 * fully-typed Dexie `Task`. Admin rows carry the same two columns but none of
 * the other required `Task` fields, so casting one to the other would be a lie.
 */
export function adminTaskAccruedSec(row: AdminRow, now: number = Date.now()): number {
  const accumulated = Number(row.accumulatedSec);
  const banked = Number.isFinite(accumulated) && accumulated > 0 ? accumulated : 0;
  const since = optionalString(row.inProgressSince);
  if (!since) return banked;
  const startedAt = Date.parse(since);
  if (Number.isNaN(startedAt)) return banked;
  return banked + Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function calculateAdminStats(rows: AdminRow[], now: number = Date.now()): AdminStats {
  const entries = rows.filter((row) => row.table === "timeEntries");
  const projects = rows.filter((row) => row.table === "projects");
  const categories = rows.filter((row) => row.table === "categories");
  const notes = rows.filter((row) => row.table === "notes");
  const tasks = rows.filter((row) => row.table === "tasks");
  const dates = new Set<string>();
  const activity: string[] = [];
  let duration = 0;
  let breakSeconds = 0;
  let runningEntryCount = 0;
  for (const row of entries) {
    const seconds = Number(row.durationSec);
    const valid = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    // Break time is tracked but never counted as work, matching how
    // `dashboardForRange` and every user-facing report treat the break tag.
    if (isBreak(row)) breakSeconds += valid;
    else if (Number.isFinite(seconds) && seconds >= 0) duration += seconds;
    if (!optionalString(row.endAt)) runningEntryCount += 1;
    const date = row.startAt ?? row.createdAt;
    if (date) { const parsed = new Date(String(date)); if (!Number.isNaN(parsed.getTime())) { dates.add(parsed.toISOString().slice(0, 10)); activity.push(parsed.toISOString()); } }
  }
  for (const row of notes) for (const value of [row.createdAt, row.updatedAt]) {
    if (!value) continue;
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) activity.push(parsed.toISOString());
  }
  activity.sort();
  const openTaskCount = tasks.filter((row) => row.status !== "done").length;
  const taskAccruedSec = tasks.reduce((sum, row) => sum + adminTaskAccruedSec(row, now), 0);
  return {
    totalTrackedDuration: duration,
    timeEntryCount: entries.length,
    activeDays: dates.size,
    firstActivity: activity[0] ?? null,
    latestActivity: activity.at(-1) ?? null,
    projectCount: projects.length,
    categoryCount: categories.length,
    noteCount: notes.length,
    taskCount: tasks.length,
    openTaskCount,
    breakSeconds,
    taskAccruedSec,
    reminderCount: rows.filter((row) => row.table === "reminders").length,
    notificationCount: rows.filter((row) => row.table === "notifications").length,
    noteLinkCount: rows.filter((row) => row.table === "noteLinks").length,
    runningEntryCount,
  };
}

export function extractCatalystRowId(raw: AdminRow, table?: string): string | number | null {
  const nested = table && raw[table] && typeof raw[table] === "object"
    ? raw[table] as AdminRow
    : null;
  const id = nested?.ROWID ?? raw.ROWID;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

export function groupRowsByUser(rows: AdminRow[], users: AdminUser[]) {
  const known = new Map(users.map((user) => [user.id, user]));
  const groups = new Map<string, { user: AdminUser; count: number }>();
  for (const user of users) groups.set(user.id, { user, count: 0 });
  for (const row of rows) {
    const id = extractCatalystRowUserId(row) ?? "unknown";
    const user = known.get(id) ?? { id, email: id === "unknown" ? "Unknown user" : id, displayName: "" };
    const current = groups.get(id);
    groups.set(id, { user, count: (current?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => (a.user.displayName || a.user.email).localeCompare(b.user.displayName || b.user.email));
}

/** `timeFormat` defaults to 24h so admin's own `date.toLocaleString()`-shaped output stays put where a caller doesn't opt in. */
export function formatDate(value: unknown, timeFormat: TimeFormat = "24h") {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString()}, ${formatTime(date, timeFormat)}`;
}

export function formatDuration(seconds: unknown) {
  if (seconds === null || seconds === undefined || seconds === "") return "—";
  const total = Number(seconds);
  if (!Number.isFinite(total)) return "—";
  const minutes = Math.floor(total / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function tiptapToPlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const node = content as { type?: string; text?: string; content?: unknown[] };
  if (node.type === "hardBreak") return "\n";
  const text = node.text ?? "";
  const children = (node.content ?? []).map(tiptapToPlainText).join("");
  return node.type === "paragraph" || node.type === "heading" || node.type === "listItem" ? `${text}${children}\n` : `${text}${children}`;
}

export function plainTextToTiptap(text: string) {
  return {
    type: "doc",
    content: text.split(/\n+/).filter(Boolean).map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })),
  };
}
