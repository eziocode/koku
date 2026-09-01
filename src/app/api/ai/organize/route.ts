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

const MAX_NOTES = 150;
const MAX_TITLE_CHARS = 150;
const MAX_SUGGESTIONS = 20;

const noteRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()).catch([]),
});

const suggestionsSchema = z.object({
  links: z
    .array(
      z.object({
        sourceId: z.string(),
        targetId: z.string(),
        reason: z.string().max(140),
      }),
    )
    .max(MAX_SUGGESTIONS),
});

function parseNotes(value: unknown) {
  if (!Array.isArray(value)) {
    throw new AiRequestError(400, "A list of notes is required.");
  }

  const notes = value.slice(0, MAX_NOTES).flatMap((item) => {
    const parsed = noteRefSchema.safeParse(item);
    if (!parsed.success) return [];
    return [{ ...parsed.data, title: parsed.data.title.slice(0, MAX_TITLE_CHARS) }];
  });

  if (!notes.length) {
    throw new AiRequestError(400, "A list of notes is required.");
  }

  return notes;
}

/**
 * Suggests links between notes that graphology's structural community
 * detection (`@/lib/graph/palette`, already used to color the graph) cannot
 * find on its own: it only clusters notes that are *already* linked, so an
 * unlinked note stays an orphan forever unless something looks at content.
 * The model only ever pairs ids it was given; ids it invents are dropped.
 */
export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);
    const notes = parseNotes(body.notes);
    const knownIds = new Set(notes.map((note) => note.id));

    const result = await auditLogger.measure(
      "ai.organize.generate",
      () => generateObject({
        model: buildModel(provider, apiKey),
        schema: suggestionsSchema,
        system:
          "You suggest links between notes in a knowledge graph, based only on their titles and tags. " +
          "Only propose a link between two ids from the provided list. Prefer notes that share a clear topic " +
          "or tag but are not obviously already grouped. Suggest at most 15 links, and skip anything you are " +
          "not reasonably confident about.",
        prompt: `Notes:\n${notes.map((note) => `${note.id}: "${note.title}" [${note.tags.join(", ")}]`).join("\n")}`,
      }),
      "performance",
      { provider, notes: notes.length },
    );

    const links = result.object.links.filter(
      (link) => knownIds.has(link.sourceId) && knownIds.has(link.targetId) && link.sourceId !== link.targetId,
    );

    return Response.json({ links });
  } catch (error) {
    return handleAiRouteError(error, "Unable to generate link suggestions.");
  }
}
