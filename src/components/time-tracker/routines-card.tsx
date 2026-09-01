"use client";

import { Copy, Play } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useCloneToTimer } from "@/components/time-tracker/use-clone-to-timer";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useRoutineSuggestions } from "@/lib/storage/hooks/use-routine-suggestions";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { resolvePeriodCopy } from "@/lib/breaks/break-copy";
import { formatTime } from "@/lib/time-format";
import { startGuardedTimer } from "@/lib/time-tracking/quick-timer";
import { useTimerStore, type ActiveTimer } from "@/lib/stores/timer-store";
import type { RoutineSuggestion } from "@/lib/time-tracking/routine-suggestions";

function centreMinuteToDate(centreMinute: number): Date {
  const date = new Date();
  date.setHours(0, Math.round(centreMinute), 0, 0);
  return date;
}

/**
 * Work you usually start around this time of day, one click away from a
 * running timer. Renders nothing when there's nothing to suggest, so it
 * never sits on the page as an empty card.
 */
export function RoutinesCard() {
  const { timers, activeBreak, startTimer } = useTimerStore();
  const { prefs } = useNotificationPreferences();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const { projects } = useProjects();
  const { categories } = useCategories();
  const cloneToTimer = useCloneToTimer();

  const runningTitles = useMemo(() => timers.map((timer: ActiveTimer) => timer.title), [timers]);
  const routines = useRoutineSuggestions(runningTitles);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (routines.length === 0) {
    return null;
  }

  function handleStart(routine: RoutineSuggestion) {
    const result = startGuardedTimer(
      { timers, activeBreak, blockNewTimers: prefs.breaks.blockNewTimers, startTimer },
      {
        title: routine.title,
        startTime: new Date().toISOString(),
        projectId: routine.projectId,
        categoryId: routine.categoryId,
        taskId: routine.taskId,
        tags: routine.tags,
        pomodoroMode: false,
      },
    );

    if (result.status === "blocked-running") {
      toast.error(result.message);
      return;
    }
    if (result.status === "blocked-break") {
      toast.error(activeBreak ? resolvePeriodCopy(activeBreak).blockedTimerMessage : result.message);
      return;
    }

    toast.success("Timer started.");
  }

  return (
    <Card className="minimal-panel">
      <CardHeader>
        <CardTitle>Routines</CardTitle>
        <CardDescription>Work you usually start around now. One click fills the timer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {routines.map((routine) => {
          const project = routine.projectId ? projectMap.get(routine.projectId) : undefined;
          const category = routine.categoryId ? categoryMap.get(routine.categoryId) : undefined;

          return (
            <div
              key={routine.key}
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/55 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium text-foreground">{routine.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {project ? (
                    <Badge variant="outline" style={{ borderColor: project.color, color: project.color }}>
                      {project.name}
                    </Badge>
                  ) : null}
                  {category ? <Badge variant="secondary">{category.name}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Usually around {formatTime(centreMinuteToDate(routine.centreMinute), timeFormat)} · {routine.count} times
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fill timer only"
                  title="Fill timer only"
                  onClick={() =>
                    cloneToTimer({
                      title: routine.title,
                      projectId: routine.projectId,
                      categoryId: routine.categoryId,
                      taskId: routine.taskId,
                      tags: routine.tags,
                    })
                  }
                >
                  <Copy />
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => handleStart(routine)}>
                  <Play className="h-3.5 w-3.5" />
                  Start
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
