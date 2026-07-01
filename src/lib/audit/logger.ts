type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

export interface AuditEvent {
  name: string;
  category: "performance" | "security" | "runtime";
  durationMs?: number;
  metadata?: AuditMetadata;
  timestamp: string;
}

interface ActiveSpan {
  id: string;
  name: string;
  category: AuditEvent["category"];
  startMs: number;
  metadata?: AuditMetadata;
}

const SECRET_PATTERN = /(api[-_]?key|token|secret|password|credential|authorization)/i;
const MAX_METADATA_VALUE_LENGTH = 160;

function isEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_KOKU_AUDIT_LOG === "1";
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function createSpanId(name: string) {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${name}:${randomId}`;
}

function sanitizeMetadata(metadata?: AuditMetadata): AuditMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_PATTERN.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] =
        value.length > MAX_METADATA_VALUE_LENGTH
          ? `${value.slice(0, MAX_METADATA_VALUE_LENGTH)}...`
          : value;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function emit(event: AuditEvent) {
  if (!isEnabled()) {
    return;
  }

  const payload = {
    ...event,
    metadata: sanitizeMetadata(event.metadata),
  };

  if (event.category === "security") {
    console.warn("[koku:audit]", payload);
  } else {
    console.debug("[koku:audit]", payload);
  }
}

class AuditLogger {
  private spans = new Map<string, ActiveSpan>();

  event(
    name: string,
    category: AuditEvent["category"] = "runtime",
    metadata?: AuditMetadata,
  ) {
    emit({
      name,
      category,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  startSpan(
    name: string,
    category: AuditEvent["category"] = "performance",
    metadata?: AuditMetadata,
  ) {
    const id = createSpanId(name);
    const span: ActiveSpan = {
      id,
      name,
      category,
      metadata: sanitizeMetadata(metadata),
      startMs: nowMs(),
    };

    this.spans.set(id, span);

    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark(`${id}:start`);
    }

    return {
      id,
      end: (metadata?: AuditMetadata) => this.endSpan(id, metadata),
      cancel: () => {
        this.spans.delete(id);
      },
    };
  }

  endSpan(id: string, metadata?: AuditMetadata) {
    const span = this.spans.get(id);
    if (!span) {
      return null;
    }

    this.spans.delete(id);
    const durationMs = Math.max(0, nowMs() - span.startMs);

    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      const endMark = `${id}:end`;
      performance.mark(endMark);
      if (typeof performance.measure === "function") {
        performance.measure(span.name, `${id}:start`, endMark);
      }
    }

    const event: AuditEvent = {
      name: span.name,
      category: span.category,
      durationMs: Number(durationMs.toFixed(2)),
      metadata: {
        ...span.metadata,
        ...sanitizeMetadata(metadata),
      },
      timestamp: new Date().toISOString(),
    };

    emit(event);
    return event;
  }

  async measure<T>(
    name: string,
    operation: () => Promise<T> | T,
    category: AuditEvent["category"] = "performance",
    metadata?: AuditMetadata,
  ) {
    const span = this.startSpan(name, category, metadata);
    try {
      const result = await operation();
      span.end({ success: true });
      return result;
    } catch (error) {
      span.end({
        success: false,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }
}

export const auditLogger = new AuditLogger();
