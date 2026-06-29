import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";

import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolvedSearchParams.month || format(new Date(), "yyyy-MM");
  const monthDate = parseISO(`${selectedMonth}-01`);
  const from = startOfMonth(monthDate);
  const to = endOfMonth(monthDate);
  const entries = await db.timeEntry.findMany({
    where: {
      userId: session!.user.id,
      workspaceId: workspace.id,
      startAt: { gte: from, lte: to },
    },
    include: { project: true },
    orderBy: { startAt: "asc" },
  });

  const projectMap = new Map<string, { name: string; value: number; hours: number; color: string }>();
  const dailyMap = new Map<string, number>();
  let totalSeconds = 0;

  for (const entry of entries) {
    totalSeconds += entry.durationSec || 0;
    const key = entry.project?.id || "unassigned";
    const existing = projectMap.get(key) || {
      name: entry.project?.name || "Unassigned",
      value: 0,
      hours: 0,
      color: entry.project?.color || "#c0392b",
    };
    existing.value += entry.durationSec || 0;
    existing.hours = Number((existing.value / 3600).toFixed(2));
    projectMap.set(key, existing);

    const dayKey = format(entry.startAt, "MMM d");
    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (entry.durationSec || 0));
  }

  return (
    <ReportsDashboard
      month={selectedMonth}
      totalHours={Number((totalSeconds / 3600).toFixed(2))}
      projectBreakdown={Array.from(projectMap.values())}
      daily={Array.from(dailyMap.entries()).map(([label, seconds]) => ({ label, hours: Number((seconds / 3600).toFixed(2)) }))}
    />
  );
}
