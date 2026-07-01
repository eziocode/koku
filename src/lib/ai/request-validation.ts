import { NextResponse } from "next/server";

import { auditLogger } from "@/lib/audit/logger";
import { isAiProvider, type AiProvider } from "@/lib/ai/providers";

const MAX_BODY_BYTES = 200_000;
const MAX_API_KEY_LENGTH = 4_096;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_NOTES = 8;
const MAX_NOTE_CONTENT_CHARS = 600;
const MAX_ENTRIES = 240;
const MAX_ENTRY_TEXT_CHARS = 500;

export class AiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export interface RequestMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RequestNote {
  title: string;
  tags: string[];
  contentPreview: string;
}

export interface StandupEntry {
  title: string;
  projectName?: string;
  durationSec: number;
}

export interface MonthlyEntry extends StandupEntry {
  categoryName?: string;
  notes?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiRequestError(400, "Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getContentLength(request: Request) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) {
    return null;
  }

  const length = Number(rawLength);
  return Number.isFinite(length) ? length : null;
}

export async function readAiJson(request: Request) {
  const contentLength = getContentLength(request);
  if (contentLength !== null && contentLength > MAX_BODY_BYTES) {
    throw new AiRequestError(413, "Request body is too large.");
  }

  try {
    return asRecord(await request.json());
  } catch (error) {
    if (error instanceof AiRequestError) {
      throw error;
    }

    throw new AiRequestError(400, "Request body must be valid JSON.");
  }
}

export function parseProvider(value: unknown): AiProvider {
  if (typeof value === "string" && isAiProvider(value)) {
    return value;
  }

  throw new AiRequestError(400, "Unsupported AI provider.");
}

export function parseApiKey(value: unknown) {
  if (typeof value === "string" && value.length > MAX_API_KEY_LENGTH) {
    throw new AiRequestError(400, "Credential is too long.");
  }

  const apiKey = cleanText(value, MAX_API_KEY_LENGTH);
  if (!apiKey) {
    throw new AiRequestError(400, "Provider credential is required.");
  }

  return apiKey;
}

export function parseMessages(value: unknown): RequestMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(-MAX_MESSAGES).flatMap((item): RequestMessage[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const role = record.role;
    const content = cleanText(record.content, MAX_MESSAGE_CHARS);

    if (
      (role === "user" || role === "assistant" || role === "system") &&
      content
    ) {
      return [{ role, content }];
    }

    return [];
  });
}

export function parseNotes(value: unknown): RequestNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_NOTES).flatMap((item): RequestNote[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = cleanText(record.title, MAX_ENTRY_TEXT_CHARS) || "Untitled note";
    const tags = Array.isArray(record.tags)
      ? record.tags
          .map((tag) => cleanText(tag, 40))
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const contentPreview = JSON.stringify(record.content ?? "")
      .slice(0, MAX_NOTE_CONTENT_CHARS)
      .replace(/\s+/g, " ");

    return [{ title, tags, contentPreview }];
  });
}

export function parseStandupEntries(value: unknown): StandupEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_ENTRIES).flatMap((item): StandupEntry[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = cleanText(record.title, MAX_ENTRY_TEXT_CHARS);
    if (!title) {
      return [];
    }

    return [{
      title,
      projectName: cleanText(record.projectName, MAX_ENTRY_TEXT_CHARS) || undefined,
      durationSec: cleanNumber(record.durationSec),
    }];
  });
}

export function parseMonthlyEntries(value: unknown): MonthlyEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_ENTRIES).flatMap((item): MonthlyEntry[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = cleanText(record.title, MAX_ENTRY_TEXT_CHARS);
    if (!title) {
      return [];
    }

    return [{
      title,
      projectName: cleanText(record.projectName, MAX_ENTRY_TEXT_CHARS) || undefined,
      durationSec: cleanNumber(record.durationSec),
      categoryName: cleanText(record.categoryName, MAX_ENTRY_TEXT_CHARS) || undefined,
      notes: cleanText(record.notes, MAX_ENTRY_TEXT_CHARS) || null,
    }];
  });
}

export function handleAiRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof AiRequestError) {
    auditLogger.event("ai.request.rejected", "security", {
      status: error.status,
      reason: error.message,
    });

    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  auditLogger.event("ai.request.failed", "security", {
    error: error instanceof Error ? error.name : "UnknownError",
  });

  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
