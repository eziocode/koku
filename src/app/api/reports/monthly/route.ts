import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { NextResponse } from "next/server";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const monthParam = new URL(request.url).searchParams.get("month");
    const baseDate = monthParam ? parseISO(`${monthParam}-01`) : new Date();
    const from = startOfMonth(baseDate);
    const to = endOfMonth(baseDate);

    const entries = await db.timeEntry.findMany({
      where: {
        userId: context.userId,
        workspaceId: context.workspace.id,
        startAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        project: true,
      },
      orderBy: { startAt: "asc" },
    });

    const totalSeconds = entries.reduce((sum, entry) => sum + (entry.durationSec || 0), 0);
    const projectTotals = new Map<string, { name: string; value: number; color: string }>();
    const dailyTotals = new Map<string, number>();

    entries.forEach((entry) => {
      const key = entry.project?.id || "unassigned";
      const existingProject = projectTotals.get(key) || {
        name: entry.project?.name || "Unassigned",
        value: 0,
        color: entry.project?.color || "#c0392b",
      };
      existingProject.value += entry.durationSec || 0;
      projectTotals.set(key, existingProject);

      const dayKey = format(entry.startAt, "MMM d");
      dailyTotals.set(dayKey, (dailyTotals.get(dayKey) || 0) + (entry.durationSec || 0));
    });

    return NextResponse.json({
      month: format(baseDate, "yyyy-MM"),
      totalSeconds,
      totalHours: Number((totalSeconds / 3600).toFixed(2)),
      projectBreakdown: Array.from(projectTotals.values()).map((item) => ({
        ...item,
        hours: Number((item.value / 3600).toFixed(2)),
      })),
      daily: Array.from(dailyTotals.entries()).map(([label, value]) => ({
        label,
        hours: Number((value / 3600).toFixed(2)),
      })),
    });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
