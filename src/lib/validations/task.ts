import { z } from "zod";

const optionalId = z.string().min(1).nullable().optional();

export const taskStatusSchema = z.enum(["open", "in_progress", "paused", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

const baseTaskSchema = z.object({
  title: z.string().min(1).max(160),
  notes: z.string().max(5000).nullable().optional(),
  status: taskStatusSchema.default("open"),
  priority: taskPrioritySchema.default("medium"),
  dueAt: z.string().datetime().nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  projectId: optionalId,
  categoryId: optionalId,
  tags: z.array(z.string().trim().min(1).max(32)).default([]),
  sortOrder: z.number().int().optional(),
});

export const taskSchema = baseTaskSchema;

export const taskUpdateSchema = baseTaskSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);
