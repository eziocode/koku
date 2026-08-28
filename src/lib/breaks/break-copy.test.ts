import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePeriodCopy } from "./break-copy";

test("null resolves to plain-break strings", () => {
  const copy = resolvePeriodCopy(null);
  assert.equal(copy.isQuickAction, false);
  assert.equal(copy.statusBadge, "On a break");
  assert.equal(copy.endLabel, "End break now");
  assert.equal(copy.statusLine, "Timers are paused until the break ends.");
});

test("a break with no tag is treated as plain even with a custom label", () => {
  const copy = resolvePeriodCopy({ label: "Lunch", tag: null });
  assert.equal(copy.isQuickAction, false);
  assert.equal(copy.endLabel, "End break now");
});

test("a single-word quick action label is lowercased inline", () => {
  const copy = resolvePeriodCopy({ label: "Call", tag: "call" });
  assert.equal(copy.isQuickAction, true);
  assert.equal(copy.statusBadge, "Running");
  assert.equal(copy.endLabel, "End call now");
  assert.equal(copy.statusLine, "Timers are paused until call ends.");
  assert.equal(copy.heroCaption, "Tracked so far today, paused while you're on call");
});

test("a multi-word quick action label is quoted verbatim inline, never lowercased", () => {
  const copy = resolvePeriodCopy({ label: "Standup with Ravi", tag: "standup" });
  assert.equal(copy.endLabel, 'End "Standup with Ravi" now');
  assert.equal(copy.statusLine, 'Timers are paused until "Standup with Ravi" ends.');
});

test("buttons and badges always show the label verbatim, never lowercased", () => {
  const copy = resolvePeriodCopy({ label: "Call", tag: "call" });
  assert.equal(copy.label, "Call");
  assert.equal(copy.completeNotificationTitle, "Call finished");
});

test("timerStatus pluralizes paused count correctly", () => {
  const copy = resolvePeriodCopy({ label: "Call", tag: "call" });
  assert.equal(copy.timerStatus(1), "On call · timer paused");
  assert.equal(copy.timerStatus(2), "On call · timers paused");

  const plain = resolvePeriodCopy(null);
  assert.equal(plain.timerStatus(0), "On a break");
  assert.equal(plain.timerStatus(1), "On a break · timer paused");
});

test("startedToast and endedToast branch on the paused/resumed count", () => {
  const copy = resolvePeriodCopy({ label: "Call", tag: "call" });
  assert.equal(copy.startedToast(0), "Call started.");
  assert.equal(copy.startedToast(1), "Call started. Your timer is paused.");
  assert.equal(copy.startedToast(2), "Call started. Your timers are paused.");
  assert.equal(copy.endedToast(0), "Call ended.");
  assert.equal(copy.endedToast(1), "Call ended. Your timer is running again.");
});
