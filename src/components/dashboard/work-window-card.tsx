"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPredictedHour, predictWorkWindows } from "@/lib/predictions/work-window";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

/**
 * Purely statistical prediction of when someone tends to log on and off,
 * per weekday, from their own tracked history (see
 * `@/lib/predictions/work-window`). No AI connection required.
 */
export function WorkWindowCard() {
  const today = useMemo(() => new Date(), []);
  const weekday = today.getDay();
  // 8 weeks of history is enough signal for `predictWorkWindows`'s lookback
  // window without pulling the whole table.
  const { entries } = useTimeEntries({
    from: new Date(today.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString(),
    to: today.toISOString(),
  });

  const predictions = useMemo(() => predictWorkWindows(entries, today), [entries, today]);
  const todayPrediction = predictions.find((prediction) => prediction.weekday === weekday);

  if (!todayPrediction) {
    return (
      <Card className="minimal-panel">
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-primary" />
            Typical hours
          </CardDescription>
          <CardTitle className="text-base font-medium text-muted-foreground">Not enough history yet</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          Log a few more {new Date(today).toLocaleDateString(undefined, { weekday: "long" })}s and Koku will predict
          your usual login and logoff times here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="minimal-panel">
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Typical {todayPrediction.weekdayLabel} hours
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {formatPredictedHour(todayPrediction.loginHour)} to {formatPredictedHour(todayPrediction.logoffHour)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">
        Based on {todayPrediction.sampleCount} past {todayPrediction.weekdayLabel}s.
      </CardContent>
    </Card>
  );
}
