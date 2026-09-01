import { z } from "zod";

/**
 * Koku AI never writes to Dexie directly from the server: the assistant runs
 * in the browser tab and the data lives in that tab's IndexedDB, so the only
 * place a write can happen is the client, after the user confirms it. The
 * model instead emits one or more `<koku-action>...</koku-action>` JSON
 * blocks inline in its reply; the client extracts them, renders a confirm
 * card per action, and applies exactly the ones the user approves.
 *
 * This (rather than the AI SDK's native tool-calling) is deliberate: a local
 * CLI connection has no tool-call protocol, only plain text, so the action
 * format has to work identically whether the reply came from `streamText`
 * or from `codex exec` piped through the bridge.
 */

const createTaskActionSchema = z.object({
  type: z.literal("create_task"),
  title: z.string().min(1).max(200),
  priority: z.enum(["low", "medium", "high"]).catch("medium"),
  projectName: z.string().max(200).optional(),
  categoryName: z.string().max(200).optional(),
  dueAt: z.string().datetime().optional().catch(undefined),
  notes: z.string().max(2000).optional(),
});

const logTimeActionSchema = z.object({
  type: z.literal("log_time"),
  title: z.string().min(1).max(200),
  projectName: z.string().max(200).optional(),
  categoryName: z.string().max(200).optional(),
  durationMinutes: z.number().min(1).max(24 * 60),
  notes: z.string().max(2000).optional(),
});

const createNoteActionSchema = z.object({
  type: z.literal("create_note"),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4000),
  tags: z.array(z.string().max(40)).max(12).catch([]),
});

export const kokuActionSchema = z.discriminatedUnion("type", [
  createTaskActionSchema,
  logTimeActionSchema,
  createNoteActionSchema,
]);

export type KokuAction = z.infer<typeof kokuActionSchema>;

const ACTION_BLOCK = /<koku-action>([\s\S]*?)<\/koku-action>/g;

/** Splits a reply into its visible text and the actions it proposed. */
export function parseKokuActions(text: string): { cleanText: string; actions: KokuAction[] } {
  const actions: KokuAction[] = [];

  const cleanText = text
    .replace(ACTION_BLOCK, (_match, jsonText: string) => {
      try {
        const parsed = kokuActionSchema.safeParse(JSON.parse(jsonText));
        if (parsed.success) {
          actions.push(parsed.data);
        }
      } catch {
        // Malformed action block: drop it silently rather than surfacing raw
        // JSON in the chat transcript.
      }
      return "";
    })
    .trim();

  return { cleanText, actions };
}

export const KOKU_ACTION_SYSTEM_PROMPT = `You are Koku AI, an assistant embedded in the Koku time-tracking app.

When the user asks you to create a task, log time, or save a note, respond with a short confirmation sentence AND append one action block per action, in this exact format:

<koku-action>{"type":"create_task","title":"...","priority":"low|medium|high","projectName":"...","categoryName":"...","notes":"..."}</koku-action>
<koku-action>{"type":"log_time","title":"...","projectName":"...","categoryName":"...","durationMinutes":30,"notes":"..."}</koku-action>
<koku-action>{"type":"create_note","title":"...","content":"...","tags":["..."]}</koku-action>

Only include fields you actually have values for; omit optional fields rather than inventing values. Never claim an action is done: the app applies it only after the user confirms the card it renders from your action block. If the user is just asking a question, do not emit any action block.`;
