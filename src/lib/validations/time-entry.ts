import { z } from "zod";

const optionalId = z.string().min(1).nullable().optional();

const baseTimeEntrySchema = z.object({
    title: z.string().min(1).max(160),
    projectId: optionalId,
    categoryId: optionalId,
    startAt: z.string().datetime(),
    endAt: z.string().datetime().nullable().optional(),
    durationSec: z.number().int().nonnegative().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).default([]),
    notes: z.string().max(5000).nullable().optional(),
  });

export const timeEntrySchema = baseTimeEntrySchema
  .refine(
    (value) => value.endAt || value.durationSec === null || value.durationSec === undefined || value.durationSec >= 0,
    { message: "Duration must be provided when end time is omitted." },
  );

export const timeEntryUpdateSchema = baseTimeEntrySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

export const timeEntryFilterSchema = z.object({
  date: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  projectId: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
});

export const projectSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  hourlyRate: z.number().nonnegative().nullable().optional(),
});

export const projectUpdateSchema = projectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

export const categorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
});
