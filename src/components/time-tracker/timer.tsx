"use client";

import { Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useTimerStore } from "@/lib/stores/timer-store";
import { formatDuration } from "@/lib/utils";

interface TimerOption {
  id: string;
  name: string;
}

interface TimerProps {
  projects: TimerOption[];
  categories: TimerOption[];
}

export function Timer({ projects, categories }: TimerProps) {
  const router = useRouter();
  const { activeTimer, startTimer, pauseTimer, stopTimer } = useTimerStore();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [pomodoroMode, setPomodoroMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const update = () => {
      if (!activeTimer) {
        setElapsedSeconds(0);
        return;
      }

      if (activeTimer.pausedAt) {
        setElapsedSeconds(activeTimer.elapsedBeforePauseSec);
        return;
      }

      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeTimer.startTime).getTime()) / 1000),
      );
      setElapsedSeconds(elapsed);
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [activeTimer]);

  const statusLabel = useMemo(() => {
    if (!activeTimer) {
      return "Ready to start";
    }

    if (activeTimer.pausedAt) {
      return "Paused";
    }

    return activeTimer.pomodoroMode ? "Pomodoro focus" : "Tracking now";
  }, [activeTimer]);

  async function handleStart() {
    if (!title.trim()) {
      toast.error("Add a title before starting the timer.");
      return;
    }

    startTimer({
      title: title.trim(),
      projectId: projectId === "none" ? null : projectId,
      categoryId: categoryId === "none" ? null : categoryId,
      startTime: new Date().toISOString(),
      pomodoroMode,
    });
    toast.success("Timer started.");
  }

  async function handleStop() {
    const timer = stopTimer();

    if (!timer) {
      return;
    }

    setSubmitting(true);
    const endedAt = new Date().toISOString();
    const durationSec = timer.pausedAt
      ? timer.elapsedBeforePauseSec
      : Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(timer.startTime).getTime()) / 1000));

    const response = await fetch("/api/time-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: timer.title,
        projectId: timer.projectId,
        categoryId: timer.categoryId,
        startAt: timer.startTime,
        endAt: endedAt,
        durationSec,
        tags: timer.pomodoroMode ? ["pomodoro"] : [],
        notes: timer.pomodoroMode ? "Pomodoro focus session" : null,
      }),
    });

    setSubmitting(false);

    if (!response.ok) {
      toast.error("The timer stopped, but saving the entry failed.");
      return;
    }

    setTitle("");
    setProjectId("none");
    setCategoryId("none");
    router.refresh();
    toast.success("Time entry saved.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live timer</CardTitle>
        <CardDescription>{statusLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-3xl border border-primary/10 bg-primary/5 px-6 py-8 text-center">
          <p className="text-5xl font-semibold tracking-tight text-foreground">{formatDuration(elapsedSeconds)}</p>
        </div>
        {!activeTimer ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="timer-title">What are you working on?</Label>
              <Input id="timer-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Design sprint planning" />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 p-4 md:col-span-2">
              <div>
                <p className="font-medium">Pomodoro mode</p>
                <p className="text-sm text-muted-foreground">Mark this as a focused cycle session.</p>
              </div>
              <Switch checked={pomodoroMode} onCheckedChange={setPomodoroMode} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{activeTimer.title}</p>
            <p className="mt-1">{activeTimer.pomodoroMode ? "Pomodoro mode enabled" : "Standard tracking"}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {!activeTimer ? (
            <Button onClick={handleStart} className="min-w-36">
              <Play />
              Start timer
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={pauseTimer}>
                <Pause />
                {activeTimer.pausedAt ? "Resume" : "Pause"}
              </Button>
              <Button variant="destructive" onClick={handleStop} disabled={submitting}>
                <Square />
                Stop & save
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
