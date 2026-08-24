import { test } from "node:test";
import assert from "node:assert/strict";

import { ITEM_COLOR_PALETTE, getUnusedItemColor, normalizeHexColor } from "./item-colors";

test("empty database returns first palette color", () => {
  assert.equal(getUnusedItemColor(), ITEM_COLOR_PALETTE[0]);
});

test("skips used colors across projects and categories", () => {
  assert.equal(getUnusedItemColor([{ color: ITEM_COLOR_PALETTE[0] }], [{ color: ITEM_COLOR_PALETTE[1] }]), ITEM_COLOR_PALETTE[2]);
});

test("matching is case-insensitive and supports equivalent hex formatting", () => {
  assert.equal(normalizeHexColor(" #ABC "), "#aabbcc");
  assert.equal(getUnusedItemColor([{ color: "#2563EB" }]), ITEM_COLOR_PALETTE[1]);
});

test("palette exhaustion returns deterministic valid six-digit color", () => {
  const used = ITEM_COLOR_PALETTE.map((color) => ({ color }));
  const first = getUnusedItemColor(used);
  assert.match(first, /^#[0-9a-f]{6}$/);
  assert.equal(getUnusedItemColor(used), first);
  assert.equal(used.some(({ color }) => normalizeHexColor(color) === first), false);
});
