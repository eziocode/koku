import type {
  AdminPresence,
  AdminRow,
  AdminStats,
  AdminUser,
  AdminWorkSchedule,
  DashboardData,
} from "@/lib/admin-data";
import { BREAK_TAG } from "@/lib/notifications/settings";

export const CHART_HEIGHT = 224;

/** Tags that mark an entry as rest, not work — matches `isBreak` in admin-data. */
export const WORK_EXCLUDED_TAGS = [BREAK_TAG];

/** Tables the detail view pages through 25 rows at a time. */
export type PagedTable = "timeEntries" | "notes" | "tasks";

/**
 * Small, unpaged tables read once per user. Each is at most a few hundred rows,
 * so they are fetched whole rather than given their own cursor and lazy list.
 */
export type AuxTable = "projects" | "categories" | "reminders" | "notifications" | "noteLinks";

export const AUX_TABLES: AuxTable[] = [
  "projects",
  "categories",
  "reminders",
  "notifications",
  "noteLinks",
];

export type AuxRows = Record<AuxTable, AdminRow[]>;

export const EMPTY_AUX_ROWS: AuxRows = {
  projects: [],
  categories: [],
  reminders: [],
  notifications: [],
  noteLinks: [],
};

export type DetailResponse = {
  user: AdminUser;
  rows: AdminRow[];
  nextCursor: string | null;
  summary: AdminStats;
  dashboard: DashboardData;
  presence?: AdminPresence;
  workSchedule?: AdminWorkSchedule;
};

export type CacheValue = { rows: AdminRow[]; nextCursor: string | null; dashboard?: DashboardData };
export type ReportResponse = { rows: AdminRow[]; nextCursor: string | null };

export function dayShift(day: string, amount: number) {
  const date = new Date(day + "T12:00:00");
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end; day = dayShift(day, 1)) days.push(day);
  return days;
}
