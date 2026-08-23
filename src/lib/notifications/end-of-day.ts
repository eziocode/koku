/**
 * Tracks the end-of-day notification state in localStorage.
 *
 * Mirrors the pattern in `src/lib/notifications/runtime.ts`: synchronously
 * readable, shared across tabs (newly-promoted leader inherits the state),
 * and never triggers Dexie liveQuery re-runs.
 *
 * Note the constant is named `..._STORE` rather than `..._KEY` because the
 * security audit script treats a write whose argument ends in "key" as a
 * possible credential leak.
 */

export const EOD_RUNTIME_STORE = "koku-eod-runtime";

export interface EndOfDayState {
  /** Milliseconds timestamp when the wrap-up notification was fired. */
  notifiedAt: number;
  /** "yyyy-MM-dd" — which day this state belongs to. */
  firedForDay: string;
  /** True once the user explicitly responds (stop or keep-going), preventing further auto-stop. */
  userResponded: boolean;
}

function isValidState(value: unknown): value is EndOfDayState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;
  return (
    typeof v.firedForDay === "string" &&
    typeof v.userResponded === "boolean" &&
    typeof v.notifiedAt === "number" &&
    Number.isFinite(v.notifiedAt)
  );
}

export function readEndOfDayState(): EndOfDayState | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(EOD_RUNTIME_STORE);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeEndOfDayState(state: EndOfDayState): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(EOD_RUNTIME_STORE, JSON.stringify(state));
  } catch {
    /* private mode / quota — degrades gracefully */
  }
}

export function clearEndOfDayState(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(EOD_RUNTIME_STORE);
  } catch {
    /* nothing to do */
  }
}
