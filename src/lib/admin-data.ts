export type AdminRow = Record<string, unknown>;

export type AdminUser = { id: string; email: string; displayName: string };
export type AdminGroup = { id: string; name: string; userIds: string[] };
export interface AdminStats {
  totalTrackedDuration: number;
  timeEntryCount: number;
  activeDays: number;
  firstActivity: string | null;
  latestActivity: string | null;
  projectCount: number;
  categoryCount: number;
  noteCount: number;
}

export type AdminPresence = {
  seenAt: string;
  visible: boolean;
  focused: boolean;
  work?: { title: string; startedAt: string } | null;
  break?: { label: string; startedAt: string } | null;
};

export type PresenceStatus = "working" | "break" | "online" | "offline";

export type DashboardData = {
  workEntries: AdminRow[];
  breakEntries: AdminRow[];
  notes: AdminRow[];
  totalSeconds: number;
  todaySeconds: number;
  activeDays: number;
  daily: Array<{ day: string; seconds: number }>;
  projects: Array<{ id: string; name: string; color: string; seconds: number }>;
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
  const projects = new Map(rows.filter((row) => row.table === "projects").map((row) => [String(row.id), row]));
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
  }
  const activity = [...entries, ...rows.filter((row) => row.table === "notes")].map((row) => validDate(row.updatedAt ?? row.startAt ?? row.createdAt)?.toISOString()).filter((value): value is string => Boolean(value)).sort();
  return { workEntries, breakEntries, notes, totalSeconds, todaySeconds, activeDays: dailyMap.size, daily: [...dailyMap].map(([day, seconds]) => ({ day, seconds })).sort((a, b) => a.day.localeCompare(b.day)), projects: [...projectMap.values()].sort((a, b) => b.seconds - a.seconds), lastActivity: activity.at(-1) ?? null };
}

export function getPresenceStatus(presence: AdminPresence | undefined, now = Date.now()): PresenceStatus {
  if (!presence || !presence.visible || !presence.focused) return "offline";
  const seen = validDate(presence.seenAt)?.getTime() ?? 0;
  if (now - seen > 5 * 60_000) return "offline";
  if (presence.break) return "break";
  if (presence.work) return "working";
  return "online";
}

export function calculateAdminStats(rows: AdminRow[]): AdminStats {
  const entries = rows.filter((row) => row.table === "timeEntries");
  const projects = rows.filter((row) => row.table === "projects");
  const categories = rows.filter((row) => row.table === "categories");
  const notes = rows.filter((row) => row.table === "notes");
  const dates = new Set<string>();
  const activity: string[] = [];
  let duration = 0;
  for (const row of entries) {
    const seconds = Number(row.durationSec);
    if (Number.isFinite(seconds) && seconds >= 0) duration += seconds;
    const date = row.startAt ?? row.createdAt;
    if (date) { const parsed = new Date(String(date)); if (!Number.isNaN(parsed.getTime())) { dates.add(parsed.toISOString().slice(0, 10)); activity.push(parsed.toISOString()); } }
  }
  for (const row of notes) for (const value of [row.createdAt, row.updatedAt]) {
    if (!value) continue;
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) activity.push(parsed.toISOString());
  }
  activity.sort();
  return { totalTrackedDuration: duration, timeEntryCount: entries.length, activeDays: dates.size, firstActivity: activity[0] ?? null, latestActivity: activity.at(-1) ?? null, projectCount: projects.length, categoryCount: categories.length, noteCount: notes.length };
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
    const id = String(row.userId ?? "unknown");
    const user = known.get(id) ?? { id, email: id === "unknown" ? "Unknown user" : id, displayName: "" };
    const current = groups.get(id);
    groups.set(id, { user, count: (current?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => (a.user.displayName || a.user.email).localeCompare(b.user.displayName || b.user.email));
}

export function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
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
