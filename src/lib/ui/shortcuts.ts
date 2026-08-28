/**
 * Single source of truth for koku's global keyboard shortcuts — the binding
 * list, the pure matching engine, and the reserved-key guarantee. Consumed by
 * `use-hotkeys.ts` (the live listener), the shortcuts help dialog, and the
 * settings sub-page. Kept free of React/DOM globals so it can be unit tested
 * as plain data (see `shortcuts.test.ts`).
 *
 * Every binding here is a bare key or Shift+key, with exactly one grandfathered
 * exception (`command-palette`, ⌘K/Ctrl+K — the app's pre-existing shortcut).
 * That is a deliberate structural choice, not an oversight: Ctrl/Cmd+letter,
 * Alt+letter, and every function key are already claimed by the browser or OS
 * (tabs, address bar, devtools, window management…), so introducing more of
 * them would either collide outright or get silently swallowed depending on
 * platform. Bare keys and Shift+letter carry no such meaning while focus is on
 * the page body — the same model Gmail, GitHub, and Linear use.
 */

export type ShortcutGroup = "General" | "Navigation" | "Tracking" | "Notifications";

export type KeyCombo =
  | { type: "key"; key: string; meta?: boolean; ctrl?: boolean }
  | { type: "chord"; leader: string; key: string };

export interface ShortcutDef {
  id: string;
  combo: KeyCombo;
  label: string;
  group: ShortcutGroup;
}

/** The one binding allowed to declare a modifier — see the module doc above. */
export const GRANDFATHERED_MODIFIER_ID = "command-palette";

export const SHORTCUTS: ShortcutDef[] = [
  { id: "help", combo: { type: "key", key: "?" }, label: "Open this shortcuts list", group: "General" },
  {
    id: "command-palette",
    combo: { type: "key", key: "k", meta: true, ctrl: true },
    label: "Open the command palette",
    group: "General",
  },
  { id: "nav-dashboard", combo: { type: "chord", leader: "g", key: "d" }, label: "Go to Dashboard", group: "Navigation" },
  { id: "nav-log", combo: { type: "chord", leader: "g", key: "l" }, label: "Go to Time Log", group: "Navigation" },
  { id: "nav-tasks", combo: { type: "chord", leader: "g", key: "t" }, label: "Go to Tasks", group: "Navigation" },
  { id: "nav-notes", combo: { type: "chord", leader: "g", key: "n" }, label: "Go to Notes", group: "Navigation" },
  { id: "nav-reports", combo: { type: "chord", leader: "g", key: "r" }, label: "Go to Reports", group: "Navigation" },
  { id: "nav-ai", combo: { type: "chord", leader: "g", key: "a" }, label: "Go to AI", group: "Navigation" },
  { id: "nav-settings", combo: { type: "chord", leader: "g", key: "s" }, label: "Go to Settings", group: "Navigation" },
  { id: "toggle-timer", combo: { type: "key", key: "t" }, label: "Start / stop the timer", group: "Tracking" },
  { id: "start-break", combo: { type: "key", key: "b" }, label: "Start a break", group: "Tracking" },
  { id: "quick-note", combo: { type: "key", key: "n" }, label: "Quick note", group: "Tracking" },
  { id: "toggle-dnd", combo: { type: "key", key: "D" }, label: "Toggle do not disturb", group: "Notifications" },
];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

const CHORD_LEADERS = new Set(
  SHORTCUTS.filter((s): s is ShortcutDef & { combo: { type: "chord"; leader: string; key: string } } => s.combo.type === "chord").map(
    (s) => s.combo.leader,
  ),
);

interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface ResolvedShortcut {
  /** The shortcut id that fired, or null if this keystroke didn't complete one. */
  matchedId: string | null;
  /** The leader to remember for the next keystroke (e.g. "g" while awaiting its second key). */
  nextPendingLeader: string | null;
}

/**
 * Pure decision function: given one keydown and the leader (if any) left
 * pending from the previous keystroke, decides what fired and what to
 * remember next. No DOM, no timers — those live in `use-hotkeys.ts`, which
 * calls this on every keydown and owns the chord timeout.
 */
export function resolveShortcut(event: KeyEventLike, pendingLeader: string | null): ResolvedShortcut {
  if (pendingLeader) {
    const chordHasModifier = event.metaKey || event.ctrlKey || event.altKey;
    const chordMatch = !chordHasModifier
      ? SHORTCUTS.find(
          (s) => s.combo.type === "chord" && s.combo.leader === pendingLeader && s.combo.key === event.key.toLowerCase(),
        )
      : undefined;
    if (chordMatch) {
      return { matchedId: chordMatch.id, nextPendingLeader: null };
    }
    // Any other key breaks the pending chord — including Escape, a modifier,
    // or a key that isn't the chord's second half. Fall through and evaluate
    // this keystroke fresh (it may itself be a new leader, e.g. "g" "g" "d").
  }

  if (event.key === "Escape") {
    return { matchedId: null, nextPendingLeader: null };
  }

  const lowerKey = event.key.toLowerCase();

  // A pending chord always wins over a standalone binding that shares its
  // leader key (e.g. plain "t" toggles the timer, but "g" then "t" navigates
  // to Tasks) — resolved above before we ever reach standalone matching.
  const standalone = SHORTCUTS.find((s) => {
    if (s.combo.type !== "key") return false;
    const { key, meta, ctrl } = s.combo;
    if (meta || ctrl) {
      return event.key.toLowerCase() === key && (event.metaKey || event.ctrlKey) && !event.altKey;
    }
    return !event.metaKey && !event.ctrlKey && !event.altKey && event.key === key;
  });

  if (standalone) {
    return { matchedId: standalone.id, nextPendingLeader: null };
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && CHORD_LEADERS.has(lowerKey)) {
    return { matchedId: null, nextPendingLeader: lowerKey };
  }

  return { matchedId: null, nextPendingLeader: null };
}

interface EditableLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * True for `input`/`textarea`/`select`/contenteditable — bare-key bindings
 * must never fire there. Duck-typed rather than an `instanceof HTMLElement`
 * check so this stays a plain, DOM-free unit — see `shortcuts.test.ts`.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const el = target as EditableLike;
  if (el.tagName && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
    return true;
  }

  if (el.isContentEditable) {
    return true;
  }

  return typeof el.closest === "function" && Boolean(el.closest('[contenteditable="true"]'));
}

/** Renders a shortcut for the help dialog / settings page. */
export function formatShortcut(def: ShortcutDef, platform: "mac" | "other" = "mac"): string {
  if (def.combo.type === "chord") {
    return `${def.combo.leader.toUpperCase()} then ${def.combo.key.toUpperCase()}`;
  }

  const { key, meta, ctrl } = def.combo;
  if (meta || ctrl) {
    return platform === "mac" ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
  }

  return /^[A-Z]$/.test(key) ? `Shift+${key}` : key;
}
