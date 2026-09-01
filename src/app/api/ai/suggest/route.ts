import { generateObject } from "ai";
import { z } from "zod";

import { buildModel } from "@/lib/ai/providers";
import {
  AiRequestError,
  handleAiRouteError,
  parseApiKey,
  parseProvider,
  readAiJson,
} from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TITLE_CHARS = 200;
const MAX_NAME_LIST = 60;
const MAX_NAME_CHARS = 100;

const suggestionSchema = z.object({
  projectName: z.string().max(MAX_NAME_CHARS).nullable(),
  categoryName: z.string().max(MAX_NAME_CHARS).nullable(),
  tags: z.array(z.string().max(40)).max(5),
});

function parseTitle(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiRequestError(400, "A title is required.");
  }
  return value.trim().slice(0, MAX_TITLE_CHARS);
}

function parseNameList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, MAX_NAME_CHARS))
    .filter(Boolean)
    .slice(0, MAX_NAME_LIST);
}

/**
 * A fallback for when Koku's own statistical title-matcher (exact / prefix /
 * fuzzy over past entries, see `@/lib/time-tracking/title-suggestions`) finds
 * nothing — e.g. an entry title that has genuinely never been logged before.
 * The model only ever picks from the project/category names it is given, or
 * returns null; it never invents a new project or category name.
 */
export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);
    const title = parseTitle(body.title);
    const existingProjects = parseNameList(body.existingProjects);
    const existingCategories = parseNameList(body.existingCategories);

    const result = await auditLogger.measure(
      "ai.suggest.generate",
      () => generateObject({
        model: buildModel(provider, apiKey),
        schema: suggestionSchema,
        system:
          "You suggest a project, category, and tags for a time-tracking entry title. " +
          "Only choose projectName/categoryName from the exact names provided in the lists below, " +
          "or return null for one if nothing fits. Never invent a new project or category name. " +
          "Suggest at most 5 short, lowercase tags.",
        prompt:
          `Title: ${title}\n` +
          `Existing projects: ${existingProjects.join(", ") || "(none)"}\n` +
          `Existing categories: ${existingCategories.join(", ") || "(none)"}`,
      }),
      "performance",
      { provider },
    );

    return Response.json(result.object);
  } catch (error) {
    return handleAiRouteError(error, "Unable to generate a suggestion.");
  }
}
