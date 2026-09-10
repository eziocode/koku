import { z } from "zod";

const date = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid timer date");
const seconds = z.number().finite().nonnegative();
const nullableId = z.string().min(1).nullish();
const timer = z.object({
  id: z.string().min(1).optional(), title: z.string(), startTime: date,
  originalStartTime: date.optional(), runStartedAt: date.nullish(), pausedAt: date.nullish(),
  elapsedBeforePauseSec: seconds.optional(), tags: z.array(z.string()).optional(),
  segments: z.array(z.object({ startAt: date, endAt: date }).refine((s) => Date.parse(s.endAt) >= Date.parse(s.startAt), "Reversed timer segment")).optional(),
  pomodoroMode: z.boolean().optional(), plannedDurationSec: seconds.optional(),
  projectId: nullableId, categoryId: nullableId, taskId: nullableId, parentTimerId: nullableId,
  notes: z.string().nullish(), revision: z.number().int().nonnegative().optional(), updatedAt: date.optional(),
}).passthrough();
const activeBreak = z.object({
  id: z.string().min(1), label: z.string(), startedAt: date, plannedDurationSec: seconds,
  pausedTimerIds: z.array(z.string()).optional(), completedAt: date.nullish(),
  notes: z.string().nullish(), revision: z.number().int().nonnegative().optional(), updatedAt: date.optional(),
  projectId: nullableId, categoryId: nullableId, tag: z.string().nullish(), description: z.string().nullish(),
}).passthrough();

// Validate imports strictly, independently of the forgiving on-device migration.
// Legacy single-timer backups remain supported without discarding fields.
export const recoveredTimerSchema = z.object({
  timers: z.array(timer).optional(), activeTimer: timer.nullish(), activeBreak: activeBreak.nullish(),
}).passthrough().refine((state) => state.timers !== undefined || "activeTimer" in state || "activeBreak" in state, "Missing timer state")
  .refine((state) => {
    const ids = state.timers?.flatMap((item) => item.id ? [item.id] : []) ?? [];
    return new Set(ids).size === ids.length;
  }, "Duplicate timer IDs");
