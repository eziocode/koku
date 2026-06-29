import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays } from "date-fns";
import { NextResponse } from "next/server";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const period = new URL(request.url).searchParams.get("period") || "week";
    const now = new Date();
    const range =
      period === "month"
        ? { from: startOfMonth(now), to: endOfMonth(now) }
        : period === "day"
          ? { from: subDays(now, 6), to: now }
          : { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };

    const entries = await db.timeEntry.findMany({
      where: {
        userId: context.userId,
        workspaceId: context.workspace.id,
        startAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      orderBy: { startAt: "asc" },
    });

    const buckets = new Map<string, number>();

    entries.forEach((entry) => {
      const label = format(entry.startAt, period === "month" ? "MMM d" : "EEE");
      buckets.set(label, (buckets.get(label) || 0) + (entry.durationSec || 0));
    });

    return NextResponse.json(
      Array.from(buckets.entries()).map(([label, totalSeconds]) => ({
        label,
        totalSeconds,
        hours: Number((totalSeconds / 3600).toFixed(2)),
      })),
    );
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
