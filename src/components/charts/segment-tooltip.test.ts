import assert from "node:assert/strict";
import { test } from "node:test";

import { getViewportShift } from "./segment-tooltip";

const CARD_WIDTH = 288; // w-72
const CARD_HEIGHT = 300;
const VIEWPORT = { viewportWidth: 1440, viewportHeight: 900 };

function rect(left: number, top: number, width = CARD_WIDTH, height = CARD_HEIGHT) {
  return { left, right: left + width, top, bottom: top + height, width };
}

test("a card that fits is left where Recharts put it", () => {
  const shift = getViewportShift({ rect: rect(600, 200), ...VIEWPORT });
  assert.deepEqual(shift, { x: 0, y: 0 });
});

test("a card running off the right edge flips to the left of the cursor", () => {
  // The reported case: hovering the last columns of the right-hand panel.
  const shift = getViewportShift({ rect: rect(1300, 400), ...VIEWPORT });
  assert.equal(shift.x, -(CARD_WIDTH + 56));
  assert.ok(1300 + shift.x >= 8, "flipped card must stay on screen");
});

test("re-measuring the natural position yields the same shift", () => {
  // The wrapper that gets measured is never the one that gets transformed, so a
  // second pass sees the same geometry and settles instead of drifting left.
  const first = getViewportShift({ rect: rect(1300, 400), ...VIEWPORT });
  const second = getViewportShift({ rect: rect(1300, 400), ...VIEWPORT });
  assert.deepEqual(second, first);
});

test("with no room on either side the card is nudged just far enough to fit", () => {
  // Narrow viewport: flipping would push it past the left edge.
  const shift = getViewportShift({
    rect: rect(60, 200),
   
    viewportWidth: 320,
    viewportHeight: 900,
  });
  assert.equal(shift.x, 320 - 8 - (60 + CARD_WIDTH));
  assert.ok(60 + shift.x >= 0);
});

test("a card overflowing the bottom is lifted, but never above the top edge", () => {
  const lifted = getViewportShift({ rect: rect(600, 700), ...VIEWPORT });
  assert.equal(lifted.y, 900 - 8 - (700 + CARD_HEIGHT));

  const tallerThanViewport = getViewportShift({
    rect: rect(600, 100, CARD_WIDTH, 1000),
   
    ...VIEWPORT,
  });
  assert.equal(100 + tallerThanViewport.y, 8, "top edge stays visible");
});
