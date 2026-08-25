import type { TimeFormat } from "@/lib/settings/schema";

export const TIME_FORMATS = ["12h", "24h"] as const satisfies readonly TimeFormat[];

export function formatTime(value: Date | string | number, format: TimeFormat): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: format === "12h",
  });
}
