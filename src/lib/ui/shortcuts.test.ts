import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatShortcut,
  GRANDFATHERED_MODIFIER_ID,
  isEditableTarget,
  resolveShortcut,
  SHORTCUTS,
} from "@/lib/ui/shortcuts";

/* ─── Reserved-key guarantee ──────────────────────────────────────────────── */
/* Codifies the design rule so it can't silently regress: nothing but the      */
/* pre-existing command palette binding is allowed to claim a modifier or a    */
/* function key, since those ranges are already owned by the browser/OS.       */

test("no shortcut but the command palette declares a modifier", () => {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.id === GRANDFATHERED_MODIFIER_ID) continue;
    if (shortcut.combo.type === "key") {
      assert.equal(shortcut.combo.meta, undefined, `${shortcut.id} must not use Cmd`);
      assert.equal(shortcut.combo.ctrl, undefined, `${shortcut.id} must not use Ctrl`);
    }
  }
});

test("no shortcut binds a function key", () => {
  for (const shortcut of SHORTCUTS) {
    const key = shortcut.combo.type === "key" ? shortcut.combo.key : shortcut.combo.leader;
    assert.doesNotMatch(key, /^F\d+$/i, `${shortcut.id} must not bind a function key`);
  }
});

test("every shortcut id is unique", () => {
  const ids = SHORTCUTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

/* ─── Matching engine ─────────────────────────────────────────────────────── */

function keyEvent(key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) {
  return { key, metaKey: false, ctrlKey: false, altKey: false, ...mods };
}

test("bare key fires its standalone shortcut", () => {
  assert.equal(resolveShortcut(keyEvent("t"), null).matchedId, "toggle-timer");
  assert.equal(resolveShortcut(keyEvent("b"), null).matchedId, "start-break");
  assert.equal(resolveShortcut(keyEvent("n"), null).matchedId, "quick-note");
  assert.equal(resolveShortcut(keyEvent("?"), null).matchedId, "help");
});

test("Shift+D toggles DND but plain d does not", () => {
  assert.equal(resolveShortcut(keyEvent("D"), null).matchedId, "toggle-dnd");
  assert.equal(resolveShortcut(keyEvent("d"), null).matchedId, null);
});

test("a modified key never fires a bare-key shortcut", () => {
  assert.equal(resolveShortcut(keyEvent("t", { metaKey: true }), null).matchedId, null);
  assert.equal(resolveShortcut(keyEvent("t", { ctrlKey: true }), null).matchedId, null);
  assert.equal(resolveShortcut(keyEvent("t", { altKey: true }), null).matchedId, null);
});

test("Cmd+K and Ctrl+K both open the command palette", () => {
  assert.equal(resolveShortcut(keyEvent("k", { metaKey: true }), null).matchedId, "command-palette");
  assert.equal(resolveShortcut(keyEvent("k", { ctrlKey: true }), null).matchedId, "command-palette");
  assert.equal(resolveShortcut(keyEvent("k"), null).matchedId, null);
});

test("g starts a pending chord with no immediate match", () => {
  const result = resolveShortcut(keyEvent("g"), null);
  assert.equal(result.matchedId, null);
  assert.equal(result.nextPendingLeader, "g");
});

test("g then d navigates to Dashboard, and a pending chord wins over the standalone binding it shares a key with", () => {
  const gResult = resolveShortcut(keyEvent("g"), null);
  const dResult = resolveShortcut(keyEvent("d"), gResult.nextPendingLeader);
  assert.equal(dResult.matchedId, "nav-dashboard");

  // "t" is bound standalone to toggle-timer AND as the second half of "g t"
  // (Tasks) — the pending chord must win, not the standalone binding.
  const tResult = resolveShortcut(keyEvent("t"), "g");
  assert.equal(tResult.matchedId, "nav-tasks");
});

test("an unrelated key breaks a pending chord instead of firing anything", () => {
  const result = resolveShortcut(keyEvent("z"), "g");
  assert.equal(result.matchedId, null);
  assert.equal(result.nextPendingLeader, null);
});

test("Escape clears a pending chord without matching", () => {
  const result = resolveShortcut(keyEvent("Escape"), "g");
  assert.equal(result.matchedId, null);
  assert.equal(result.nextPendingLeader, null);
});

test("a modifier held during a pending chord breaks it rather than matching", () => {
  const result = resolveShortcut(keyEvent("d", { metaKey: true }), "g");
  assert.equal(result.matchedId, null);
});

/* ─── isEditableTarget ────────────────────────────────────────────────────── */

test("isEditableTarget recognizes form fields and contenteditable", () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({} as EventTarget), false);
  assert.equal(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "DIV" } as unknown as EventTarget), false);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(
    isEditableTarget({
      tagName: "SPAN",
      closest: (selector: string) => (selector === '[contenteditable="true"]' ? {} : null),
    } as unknown as EventTarget),
    true,
  );
});

/* ─── formatShortcut ──────────────────────────────────────────────────────── */

test("formatShortcut renders chords, modifiers, and Shift+letter", () => {
  const chord = SHORTCUTS.find((s) => s.id === "nav-dashboard")!;
  assert.equal(formatShortcut(chord), "G then D");

  const palette = SHORTCUTS.find((s) => s.id === "command-palette")!;
  assert.equal(formatShortcut(palette, "mac"), "⌘K");
  assert.equal(formatShortcut(palette, "other"), "Ctrl+K");

  const dnd = SHORTCUTS.find((s) => s.id === "toggle-dnd")!;
  assert.equal(formatShortcut(dnd), "Shift+D");

  const help = SHORTCUTS.find((s) => s.id === "help")!;
  assert.equal(formatShortcut(help), "?");
});
