import assert from "node:assert/strict";
import { test } from "node:test";

import { getTooltipPosition } from "./segment-tooltip";

const CARD = { width: 288, height: 300 }; // w-72, a typical single-log card
const VIEWPORT = { viewportWidth: 1440, viewportHeight: 900 };
const FLIP_GAP = 56;
const MARGIN = 8;

test("a card that fits is left where Recharts anchored it", () => {
  const position = getTooltipPosition({ anchor: { x: 600, y: 200 }, size: CARD, ...VIEWPORT });
  assert.deepEqual(position, { left: 600, top: 200 });
});

test("a card running off the right edge flips to the left of the anchor", () => {
  // The reported case: hovering the last columns of the right-hand panel.
  const position = getTooltipPosition({ anchor: { x: 1300, y: 200 }, size: CARD, ...VIEWPORT });
  assert.equal(position.left, 1300 - FLIP_GAP - CARD.width);
  assert.ok(position.left >= MARGIN, "flipped card must stay on screen");
});

test("placement is stable when re-measured at the same anchor", () => {
  const first = getTooltipPosition({ anchor: { x: 1300, y: 200 }, size: CARD, ...VIEWPORT });
  const second = getTooltipPosition({ anchor: { x: 1300, y: 200 }, size: CARD, ...VIEWPORT });
  assert.deepEqual(second, first);
});

test("with no room on either side the card is nudged just far enough to fit", () => {
  const position = getTooltipPosition({
    anchor: { x: 60, y: 100 },
    size: CARD,
    viewportWidth: 320,
    viewportHeight: 900,
  });
  assert.equal(position.left, 320 - MARGIN - CARD.width);
  assert.ok(position.left >= 0);
});

test("a card overflowing the bottom is lifted clear of the edge", () => {
  const position = getTooltipPosition({ anchor: { x: 400, y: 800 }, size: CARD, ...VIEWPORT });
  assert.equal(position.top, 900 - MARGIN - CARD.height);
});

test("a card taller than the viewport still starts on screen", () => {
  const position = getTooltipPosition({
    anchor: { x: 400, y: 400 },
    size: { width: CARD.width, height: 1200 },
    ...VIEWPORT,
  });
  assert.equal(position.top, MARGIN);
});
