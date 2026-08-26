"use client";

import { ChevronDown, ChevronUp, Pause, Play, Plus, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { PopOutButton } from "@/components/mini-player/pop-out-button";
import { BreakButton, BreakCard } from "@/components/time-tracker/break-controls";
import { QuickCreateCategoryDialog, QuickCreateProjectDialog } from "@/components/time-tracker/quick-create-dialog";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import {
  getActiveTimerElapsedSec,
  type ActiveTimer,
  type TimerStartInput,
  useTimerStore,
} from "@/lib/stores/timer-store";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { buildEntryFromTimer } from "@/lib/time-tracking/stop-timer";
import { formatDuration } from "@/lib/utils";

/**
 * How many session cards the list shows before it starts scrolling.
 *
 * Past this the card would keep growing with every parallel task, dragging the
 * dashboard grid taller on each start and shorter on each stop. Capping the
 * list at the height of the first four cards — measured, not guessed, since a
 * card with notes is taller than one without — keeps the panel a fixed size.
 */
const MAX_VISIBLE_TIMER_CARDS = 4;

/** Shown when the store refuses a resume because a break is in progress. */
const BREAK_BLOCKS_RESUME = "Finish or cancel your break to resume tracking.";

interface SelectOption {
  id: string;
  name: string;
}

interface TimerFieldsProps {
  idPrefix: string;
  title: string;
  projectId: string;
  categoryId: string;
  tags: string[];
  notes: string;
  pomodoroMode: boolean;
  projects: SelectOption[];
  categories: SelectOption[];
  tagSuggestions?: string[];
  onTitleChange: (value: string) => void;
  onProjectIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
  onNotesChange: (notes: string) => void;
  onPomodoroModeChange: (value: boolean) => void;
}

interface TimerSessionCardProps {
  timer: ActiveTimer;
  elapsedSec: number;
  isPrimary: boolean;
  projectName: string;
  categoryName: string;
  submitting: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Present only when the parent decides a parallel task can be added now. */
  onStartParallelTask?: () => void;
  startParallelLabel?: string;
  onAppendNote: (text: string) => void;
}

function TimerFields({
  idPrefix,
  title,
  projectId,
  categoryId,
  tags,
  notes,
  pomodoroMode,
  projects,
  categories,
  tagSuggestions = [],
  onTitleChange,
  onProjectIdChange,
  onCategoryIdChange,
  onTagsChange,
  onNotesChange,
  onPomodoroModeChange,
}: TimerFieldsProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Title */}
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-title`}>What are you working on?</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Design sprint planning"
        />
      </div>

      {/* Project */}
      <div className="space-y-1.5">
        <Label>Project</Label>
        <Select value={projectId} onValueChange={onProjectIdChange}>
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
        <button
          type="button"
          onClick={() => setCreateProjectOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          + New project
        </button>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={onCategoryIdChange}>
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
        <button
          type="button"
          onClick={() => setCreateCategoryOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          + New category
        </button>
      </div>

      {/* Tags */}
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-tags`}>Tags</Label>
        <TagInput
          id={`${idPrefix}-tags`}
          value={tags}
          onChange={onTagsChange}
          suggestions={tagSuggestions}
          placeholder="Add tag…"
        />
      </div>

      {/* Notes toggle */}
      <div className="md:col-span-2">
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {notesOpen ? "Hide notes" : "Add notes"}
        </button>
        {notesOpen && (
          <Textarea
            id={`${idPrefix}-notes`}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Helpful context, goals, or outcomes…"
            className="mt-2"
            rows={3}
          />
        )}
      </div>

      {/* Pomodoro */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 p-4 md:col-span-2">
        <div>
          <Label htmlFor={`${idPrefix}-pomodoro`} className="font-medium">Pomodoro mode</Label>
          <p className="text-sm text-muted-foreground">Mark this as a focused cycle session.</p>
        </div>
        <Switch id={`${idPrefix}-pomodoro`} checked={pomodoroMode} onCheckedChange={onPomodoroModeChange} />
      </div>

      {/* Quick-create dialogs */}
      <QuickCreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(id) => { onProjectIdChange(id); setCreateProjectOpen(false); }}
      />
      <QuickCreateCategoryDialog
        open={createCategoryOpen}
        onOpenChange={setCreateCategoryOpen}
        onCreated={(id) => { onCategoryIdChange(id); setCreateCategoryOpen(false); }}
      />
    </div>
  );
}

function TimerSessionCard({
  timer,
  elapsedSec,
  isPrimary,
  projectName,
  categoryName,
  submitting,
  onPause,
  onResume,
  onStop,
  onStartParallelTask,
  startParallelLabel = "Start parallel task",
  onAppendNote,
}: TimerSessionCardProps) {
  const isPaused = Boolean(timer.pausedAt);
  const [quickNote, setQuickNote] = useState("");

  function submitQuickNote() {
    if (!quickNote.trim()) return;
    onAppendNote(quickNote);
    setQuickNote("");
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{timer.title}</p>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              {isPrimary ? "Primary task" : "Parallel task"}
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              {isPaused ? "Paused" : "Running"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {projectName} · {categoryName} · {timer.pomodoroMode ? "Pomodoro" : "Standard tracking"}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-foreground">
          {formatDuration(elapsedSec)}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={isPaused ? onResume : onPause}>
          {isPaused ? <Play /> : <Pause />}
          {isPaused ? "Resume" : "Pause"}
        </Button>
        <Button variant="destructive" onClick={onStop} disabled={submitting}>
          <Square />
          Stop &amp; save
        </Button>
        {/* Gating lives in the parent: a parallel task is only offered while
            nothing is being tracked, so two clocks can never run at once. */}
        {onStartParallelTask ? (
          <Button variant="outline" onClick={onStartParallelTask}>
            <Plus />
            {startParallelLabel}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={quickNote}
          onChange={(event) => setQuickNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitQuickNote();
            }
          }}
          placeholder="Quick note about this timer…"
          aria-label={`Quick note for ${timer.title}`}
          className="h-10"
        />
        <Button type="button" variant="outline" onClick={submitQuickNote} disabled={!quickNote.trim()}>
          Add note
        </Button>
      </div>
    </div>
  );
}

function buildTimerInput(
  title: string,
  projectId: string,
  categoryId: string,
  pomodoroMode: boolean,
  tags: string[],
  notes: string,
): TimerStartInput {
  return {
    title: title.trim(),
    projectId: projectId === "none" ? null : projectId,
    categoryId: categoryId === "none" ? null : categoryId,
    startTime: new Date().toISOString(),
    pomodoroMode,
    tags,
    notes: notes.trim() || null,
  };
}

function resetForm(
  setTitle: (value: string) => void,
  setProjectId: (value: string) => void,
  setCategoryId: (value: string) => void,
  setPomodoroMode: (value: boolean) => void,
  setTags: (value: string[]) => void,
  setNotes: (value: string) => void,
) {
  setTitle("");
  setProjectId("none");
  setCategoryId("none");
  setPomodoroMode(false);
  setTags([]);
  setNotes("");
}

export function Timer() {
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { createEntry, entries: allEntries } = useTimeEntries();
  const { timers, activeBreak, startTimer, startSecondaryTimer, pauseTimer, resumeTimer, stopTimer, appendNote } =
    useTimerStore();
  const tickNow = useSecondTick();
  const { prefs } = useNotificationPreferences();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [pomodoroMode, setPomodoroMode] = useState(false);
  const [secondaryTitle, setSecondaryTitle] = useState("");
  const [secondaryProjectId, setSecondaryProjectId] = useState<string>("none");
  const [secondaryCategoryId, setSecondaryCategoryId] = useState<string>("none");
  const [secondaryTags, setSecondaryTags] = useState<string[]>([]);
  const [secondaryNotes, setSecondaryNotes] = useState("");
  const [secondaryPomodoroMode, setSecondaryPomodoroMode] = useState(false);
  const [submittingByTimerId, setSubmittingByTimerId] = useState<Record<string, boolean>>({});
  const [resumePrimaryId, setResumePrimaryId] = useState<string | null>(null);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeSubmitting, setResumeSubmitting] = useState(false);

  const tagSuggestions = useMemo(
    () => Array.from(new Set(allEntries.flatMap((e) => e.tags))).sort(),
    [allEntries],
  );

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const primaryTimer = useMemo(
    () => timers.find((timer) => !timer.parentTimerId) ?? null,
    [timers],
  );
  const secondaryTimers = useMemo(
    () => (primaryTimer ? timers.filter((timer) => timer.parentTimerId === primaryTimer.id) : []),
    [primaryTimer, timers],
  );
  const orderedTimers = useMemo(() => {
    if (!primaryTimer) {
      return timers;
    }

    return [
      primaryTimer,
      ...timers.filter((timer) => timer.id !== primaryTimer.id),
    ];
  }, [primaryTimer, timers]);
  const timerListScrolls = orderedTimers.length > MAX_VISIBLE_TIMER_CARDS;

  // Height of the first `MAX_VISIBLE_TIMER_CARDS` cards, measured from the DOM.
  // A live timer re-renders every second, so this is read from element geometry
  // rather than recomputed from a guessed per-card constant that would drift the
  // moment a card gains a notes field or a second line of badges.
  const timerListRef = useRef<HTMLDivElement | null>(null);
  const [timerListMaxHeight, setTimerListMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const list = timerListRef.current;
    if (!list || !timerListScrolls) {
      setTimerListMaxHeight(null);
      return;
    }

    const measure = () => {
      const cards = Array.from(list.children) as HTMLElement[];
      const last = cards[MAX_VISIBLE_TIMER_CARDS - 1];
      if (!last) {
        return;
      }
      // `offsetTop` is relative to the list, so this already includes the gaps
      // between cards. Half a card of the next one peeks through, which is what
      // tells the eye the list continues.
      setTimerListMaxHeight(last.offsetTop + last.offsetHeight + 12);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const card of Array.from(list.children)) {
      observer.observe(card);
    }
    return () => observer.disconnect();
  }, [timerListScrolls, orderedTimers.length]);

  /** A parallel task may only be added once nothing is being tracked. */
  const allTimersPaused = timers.length > 0 && timers.every((timer) => Boolean(timer.pausedAt));
  const runningCount = timers.filter((timer) => !timer.pausedAt).length;
  const pendingResumeTimer = resumePrimaryId
    ? timers.find((timer) => timer.id === resumePrimaryId) ?? null
    : null;
  const pendingSecondaryTimers = pendingResumeTimer
    ? timers.filter((timer) => timer.parentTimerId === pendingResumeTimer.id)
    : [];

  // Elapsed values come from one shared clock (`useSecondTick`) rather than an
  // interval per component: `/log` and `/dashboard` both mount this component,
  // and separate intervals meant duplicated work and clocks that could disagree
  // by a second. Values are derived from timestamps, so a throttled or slept
  // tab is still correct on its next paint.
  //
  // The hero reads the *session* total rather than mirroring the primary timer's
  // card below it, which made the same number appear twice. Paused timers
  // contribute their frozen elapsed and running ones keep ticking, so the hero
  // keeps counting whenever any task — primary or parallel — is running.
  const heroElapsedSeconds = useMemo(
    () => timers.reduce((total, timer) => total + getActiveTimerElapsedSec(timer, tickNow), 0),
    [timers, tickNow],
  );
  const heroCaption = useMemo(() => {
    if (activeBreak) {
      return "Tracked so far today — paused while you are on a break";
    }

    if (!timers.length) {
      return "Nothing tracking yet";
    }

    if (timers.length === 1) {
      return timers[0].pausedAt ? "Paused" : "Tracking one task";
    }

    return `${timers.length} tasks · ${runningCount} running`;
  }, [activeBreak, runningCount, timers]);

  const statusLabel = useMemo(() => {
    if (activeBreak) {
      return timers.length ? `On a break · ${timers.length === 1 ? "timer" : "timers"} paused` : "On a break";
    }

    if (!timers.length) {
      return "Ready to start";
    }

    if (allTimersPaused) {
      return timers.length > 1 ? `All ${timers.length} timers paused` : "Paused";
    }

    if (primaryTimer?.pausedAt) {
      return secondaryTimers.length
        ? `Primary paused · ${secondaryTimers.length} parallel task${secondaryTimers.length === 1 ? "" : "s"} active`
        : "Primary paused";
    }

    if (timers.length > 1) {
      return `${runningCount} of ${timers.length} timers tracking`;
    }

    const onlyTimer = timers[0];
    return onlyTimer?.pomodoroMode ? "Pomodoro focus" : "Tracking now";
  }, [activeBreak, allTimersPaused, primaryTimer, runningCount, secondaryTimers.length, timers]);

  function setTimerSubmitting(timerId: string, submitting: boolean) {
    setSubmittingByTimerId((current) => ({
      ...current,
      [timerId]: submitting,
    }));
  }

  function getProjectName(timer: ActiveTimer) {
    return timer.projectId ? projectMap.get(timer.projectId) ?? "Unknown project" : "No project";
  }

  function getCategoryName(timer: ActiveTimer) {
    return timer.categoryId ? categoryMap.get(timer.categoryId) ?? "Unknown category" : "No category";
  }

  async function saveTimerEntry(timer: ActiveTimer, endedAt: string) {
    await createEntry(buildEntryFromTimer(timer, endedAt));
  }

  function handleStart() {
    if (!title.trim()) {
      toast.error("Add a title before starting the timer.");
      return;
    }

    const started = startTimer(
      buildTimerInput(title, projectId, categoryId, pomodoroMode, tags, notes),
      { allowDuringBreak: !prefs.breaks.blockNewTimers },
    );

    if (!started) {
      // The store refuses for one of two reasons, and they need different advice.
      toast.error(
        activeBreak
          ? "Finish or cancel your break before starting a timer."
          : "Stop and save all active timers before starting another.",
      );
      return;
    }

    toast.success("Timer started.");
  }

  function handleStartParallelTask() {
    if (!primaryTimer?.pausedAt || !allTimersPaused) {
      toast.error("Pause every running timer before starting a parallel task.");
      return;
    }

    if (!secondaryTitle.trim()) {
      toast.error("Add a title before starting the parallel task.");
      return;
    }

    const started = startSecondaryTimer(
      primaryTimer.id,
      buildTimerInput(secondaryTitle, secondaryProjectId, secondaryCategoryId, secondaryPomodoroMode, secondaryTags, secondaryNotes),
    );

    if (!started) {
      toast.error("Pause every running timer before starting a parallel task.");
      return;
    }

    resetForm(setSecondaryTitle, setSecondaryProjectId, setSecondaryCategoryId, setSecondaryPomodoroMode, setSecondaryTags, setSecondaryNotes);
    toast.success("Parallel task started.");
  }

  async function handleStop(timer: ActiveTimer) {
    setTimerSubmitting(timer.id, true);
    const endedAt = new Date().toISOString();

    try {
      await saveTimerEntry(timer, endedAt);
      stopTimer(timer.id);
      if (timers.length === 1) {
        resetForm(setTitle, setProjectId, setCategoryId, setPomodoroMode, setTags, setNotes);
      }
      toast.success("Time entry saved.");
    } catch {
      toast.error("Saving failed. The timer is still active so you can retry.");
    } finally {
      setTimerSubmitting(timer.id, false);
    }
  }

  function handleResume(timer: ActiveTimer) {
    const relatedSecondaryTimers = timers.filter((item) => item.parentTimerId === timer.id);

    if (!relatedSecondaryTimers.length) {
      if (!resumeTimer(timer.id)) {
        toast.error(BREAK_BLOCKS_RESUME);
      }
      return;
    }

    setResumePrimaryId(timer.id);
    setResumeDialogOpen(true);
  }

  function handleKeepParallel() {
    if (!pendingResumeTimer) {
      return;
    }

    if (!resumeTimer(pendingResumeTimer.id)) {
      toast.error(BREAK_BLOCKS_RESUME);
      return;
    }

    setResumeDialogOpen(false);
    setResumePrimaryId(null);
    toast.success("Primary timer resumed. Parallel tasks are still running.");
  }

  async function handleCloseSecondaries() {
    if (!pendingResumeTimer) {
      return;
    }

    setResumeSubmitting(true);

    try {
      for (const timer of pendingSecondaryTimers) {
        const endedAt = new Date().toISOString();
        await saveTimerEntry(timer, endedAt);
        stopTimer(timer.id);
      }

      // The parallel tasks are saved either way; only the resume can be refused,
      // so report that honestly rather than claiming the primary is running.
      const resumed = resumeTimer(pendingResumeTimer.id);
      setResumeDialogOpen(false);
      setResumePrimaryId(null);

      if (resumed) {
        toast.success("Parallel tasks saved. Primary timer resumed.");
      } else {
        toast.error(`Parallel tasks saved. ${BREAK_BLOCKS_RESUME}`);
      }
    } catch {
      toast.error("Unable to save a parallel task. The primary timer is still paused.");
    } finally {
      setResumeSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live timer</CardTitle>
        <CardDescription>{statusLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-3xl border border-primary/10 bg-primary/5 px-6 py-8 text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {timers.length > 1 ? "Session total" : "Elapsed"}
          </p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatDuration(heroElapsedSeconds)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{heroCaption}</p>
        </div>

        {activeBreak ? (
          <BreakCard />
        ) : !timers.length ? (
          <>
            <TimerFields
              idPrefix="timer"
              title={title}
              projectId={projectId}
              categoryId={categoryId}
              tags={tags}
              notes={notes}
              pomodoroMode={pomodoroMode}
              projects={projects}
              categories={categories}
              tagSuggestions={tagSuggestions}
              onTitleChange={setTitle}
              onProjectIdChange={setProjectId}
              onCategoryIdChange={setCategoryId}
              onTagsChange={setTags}
              onNotesChange={setNotes}
              onPomodoroModeChange={setPomodoroMode}
            />
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleStart} className="min-w-36">
                <Play />
                Start timer
              </Button>
              <BreakButton />
              <PopOutButton />
            </div>
          </>
        ) : (
          <>
            {primaryTimer?.pausedAt && allTimersPaused ? (
              <div className="space-y-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div>
                  <p className="font-medium text-foreground">Start a parallel task</p>
                  <p className="text-sm text-muted-foreground">
                    Every timer is paused. Add work for another task, then resume or save it below.
                  </p>
                </div>
                <TimerFields
                  idPrefix="parallel-task"
                  title={secondaryTitle}
                  projectId={secondaryProjectId}
                  categoryId={secondaryCategoryId}
                  tags={secondaryTags}
                  notes={secondaryNotes}
                  pomodoroMode={secondaryPomodoroMode}
                  projects={projects}
                  categories={categories}
                  tagSuggestions={tagSuggestions}
                  onTitleChange={setSecondaryTitle}
                  onProjectIdChange={setSecondaryProjectId}
                  onCategoryIdChange={setSecondaryCategoryId}
                  onTagsChange={setSecondaryTags}
                  onNotesChange={setSecondaryNotes}
                  onPomodoroModeChange={setSecondaryPomodoroMode}
                />
                <Button onClick={handleStartParallelTask} className="min-w-44">
                  <Plus />
                  Start parallel task
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              {(() => {
                const list = (
                  <div ref={timerListRef} className="space-y-3">
                    {orderedTimers.map((timer) => (
                      <TimerSessionCard
                        key={timer.id}
                        timer={timer}
                        elapsedSec={getActiveTimerElapsedSec(timer, tickNow)}
                        isPrimary={!timer.parentTimerId}
                        projectName={getProjectName(timer)}
                        categoryName={getCategoryName(timer)}
                        submitting={Boolean(submittingByTimerId[timer.id])}
                        onPause={() => pauseTimer(timer.id)}
                        onResume={() => handleResume(timer)}
                        onStop={() => void handleStop(timer)}
                        onStartParallelTask={
                          // Offered on the primary card only, and only while something
                          // is still running: pausing *everything* is what makes room
                          // for a parallel task, so the button does exactly that.
                          !timer.parentTimerId && !allTimersPaused
                            ? () => {
                                for (const running of timers) {
                                  if (!running.pausedAt) {
                                    pauseTimer(running.id);
                                  }
                                }
                              }
                            : undefined
                        }
                        startParallelLabel={
                          runningCount > 1 ? "Pause all & add parallel task" : "Start parallel task"
                        }
                        onAppendNote={(text) => {
                          if (appendNote(timer.id, text)) {
                            toast.success("Note added to timer.");
                          }
                        }}
                      />
                    ))}
                  </div>
                );

                if (!timerListScrolls) {
                  return list;
                }

                return (
                  <div className="space-y-2">
                    {/* Negative margin + padding keeps the scrollbar off the
                        cards without insetting them from the card's edge. */}
                    <ScrollArea
                      className="-mr-3 pr-3"
                      style={timerListMaxHeight ? { height: timerListMaxHeight } : undefined}
                    >
                      {list}
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      Showing {MAX_VISIBLE_TIMER_CARDS} of {orderedTimers.length} timers — scroll
                      for the rest.
                    </p>
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-3">
                <BreakButton />
                <PopOutButton />
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={resumeDialogOpen}
        onOpenChange={(open) => {
          setResumeDialogOpen(open);
          if (!open && !resumeSubmitting) {
            setResumePrimaryId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume primary timer?</DialogTitle>
            <DialogDescription>
              {pendingSecondaryTimers.length} parallel task{pendingSecondaryTimers.length === 1 ? "" : "s"} are still active.
              Save them now, or keep them running while the primary timer resumes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResumeDialogOpen(false);
                setResumePrimaryId(null);
              }}
              disabled={resumeSubmitting}
            >
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleKeepParallel} disabled={resumeSubmitting}>
              Keep parallel
            </Button>
            <Button onClick={() => void handleCloseSecondaries()} disabled={resumeSubmitting}>
              Save parallel tasks &amp; resume primary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
