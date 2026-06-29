import { z } from "zod";

export const noteSchema = z.object({
  title: z.string().min(1).max(180),
  slug: z.string().min(1).max(180).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).default([]),
  content: z.any(),
});

export const noteUpdateSchema = noteSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);
