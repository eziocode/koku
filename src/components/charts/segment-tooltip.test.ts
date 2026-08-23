import assert from "node:assert/strict";
import { test } from "node:test";

import { getViewportShift } from "./segment-tooltip";

const CARD_WIDTH = 288; // w-72
const CARD_HEIGHT = 300;
const VIEWPORT = { viewportWidth: 1440, viewportHeight: 900 };
const NO_SHIFT = { x: 0, y: 0 };

function rect(left: number, top: number, width = CARD_WIDTH, height = CARD_HEIGHT) {
  return { left, right: left + width, top, bottom: top + height, width };
}

test("a card that fits is left where Recharts put it", () => {
  const shift = getViewportShift({ rect: rect(600, 200), shift: NO_SHIFT, ...VIEWPORT });
  assert.deepEqual(shift, { x: 0, y: 0 });
});

test("a card running off the right edge flips to the left of the cursor", () => {
  // The reported case: hovering the last columns of the right-hand panel.
  const shift = getViewportShift({ rect: rect(1300, 400), shift: NO_SHIFT, ...VIEWPORT });
  assert.equal(shift.x, -(CARD_WIDTH + 56));
  assert.ok(1300 + shift.x >= 8, "flipped card must stay on screen");
});

test("the shift already applied is not compounded on re-measure", () => {
  const first = getViewportShift({ rect: rect(1300, 400), shift: NO_SHIFT, ...VIEWPORT });
  // Second pass sees the card where the first pass moved it.
  const second = getViewportShift({
    rect: rect(1300 + first.x, 400),
    shift: first,
    ...VIEWPORT,
  });
  assert.deepEqual(second, first, "must converge, not drift further left");
});

test("with no room on either side the card is nudged just far enough to fit", () => {
  // Narrow viewport: flipping would push it past the left edge.
  const shift = getViewportShift({
    rect: rect(60, 200),
    shift: NO_SHIFT,
    viewportWidth: 320,
    viewportHeight: 900,
  });
  assert.equal(shift.x, 320 - 8 - (60 + CARD_WIDTH));
  assert.ok(60 + shift.x >= 0);
});

test("a card overflowing the bottom is lifted, but never above the top edge", () => {
  const lifted = getViewportShift({ rect: rect(600, 700), shift: NO_SHIFT, ...VIEWPORT });
  assert.equal(lifted.y, 900 - 8 - (700 + CARD_HEIGHT));

  const tallerThanViewport = getViewportShift({
    rect: rect(600, 100, CARD_WIDTH, 1000),
    shift: NO_SHIFT,
    ...VIEWPORT,
  });
  assert.equal(100 + tallerThanViewport.y, 8, "top edge stays visible");
});
