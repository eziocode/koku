import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBreakCompleteNotification,
  buildCheckInNotification,
  buildEndOfDayNotification,
  buildEndOfDaySnoozedNotification,
  buildNotificationActions,
  buildTestNotification,
  NOTIFICATION_TAGS,
  type CheckInContext,
} from "./payload";
import { NOTIFICATION_DEFAULTS, type NotificationPreferences } from "./settings";

const NOW = Date.parse("2026-08-21T14:00:00.000Z");
const chrome = { maxActions: 2 };
const noActions = { maxActions: 0 };

function prefs(overrides: Partial<NotificationPreferences["checkIn"]> = {}): NotificationPreferences {
  return {
    ...NOTIFICATION_DEFAULTS,
    checkIn: { ...NOTIFICATION_DEFAULTS.checkIn, ...overrides },
  };
}

const running: CheckInContext = {
  kind: "timer-running",
  timerId: "t1",
  title: "Design sprint",
  elapsedSec: 4_320,
};

/* ─── Action degradation ──────────────────────────────────────────────────── */

test("truncates actions to what the browser will render", () => {
  const all = NOTIFICATION_DEFAULTS.checkIn.actions;

  assert.deepEqual(
    buildNotificationActions(all, { maxActions: 3 }).map((a) => a.action),
    ["quick-note", "open-log", "dismiss"],
  );
  // Chrome desktop shows 2: the two that actually do something win.
  assert.deepEqual(
    buildNotificationActions(all, chrome).map((a) => a.action),
    ["quick-note", "open-log"],
  );
  assert.deepEqual(
    buildNotificationActions(all, { maxActions: 1 }).map((a) => a.action),
    ["quick-note"],
  );
});

test("browsers that ignore actions get an empty array, not buttons they will drop", () => {
  assert.deepEqual(buildNotificationActions(NOTIFICATION_DEFAULTS.checkIn.actions, noActions), []);
});

test("disabled actions are filtered before truncation", () => {
  const actions = buildNotificationActions(
    { quickNote: false, openLog: true, dismiss: true },
    chrome,
  );

  assert.deepEqual(actions.map((a) => a.action), ["open-log", "dismiss"]);
});

test("every action carries a human-readable title", () => {
  for (const action of buildNotificationActions(NOTIFICATION_DEFAULTS.checkIn.actions, { maxActions: 3 })) {
    assert.ok(action.title.length > 0, action.action);
  }
});

/* ─── Check-in content ────────────────────────────────────────────────────── */

test("a running timer's check-in names the timer and its elapsed time", () => {
  const built = buildCheckInNotification(running, prefs(), chrome, NOW);

  assert.ok(built);
  assert.match(built.title, /Design sprint/);
  assert.match(built.options.body ?? "", /1h 12m/);
  assert.equal(built.options.tag, NOTIFICATION_TAGS.checkIn);
  assert.equal(built.options.renotify, true);
  assert.equal(built.autoHideAfterMs, 60_000);
});

test("sticky check-ins disable auto-hide", () => {
  const built = buildCheckInNotification(running, prefs({ requireInteraction: true, autoHideMinutes: 5 }), chrome, NOW);
  assert.equal(built?.autoHideAfterMs, undefined);
});

test("a paused timer reads differently from a running one", () => {
  const built = buildCheckInNotification({ ...running, kind: "timer-paused" }, prefs(), chrome, NOW);

  assert.ok(built);
  assert.match(built.title, /Paused/);
});

test("the idle nudge is suppressed when the user turned it off", () => {
  const context: CheckInContext = { kind: "idle", lastEntryTitle: "Standup", idleForSec: 2_040 };

  assert.ok(buildCheckInNotification(context, prefs({ notifyWhenIdle: true }), chrome, NOW));
  assert.equal(buildCheckInNotification(context, prefs({ notifyWhenIdle: false }), chrome, NOW), null);
});

test("the idle nudge mentions the last entry when there is one", () => {
  const withLast = buildCheckInNotification(
    { kind: "idle", lastEntryTitle: "Standup", idleForSec: null },
    prefs(),
    chrome,
    NOW,
  );
  const without = buildCheckInNotification(
    { kind: "idle", lastEntryTitle: null, idleForSec: null },
    prefs(),
    chrome,
    NOW,
  );

  assert.match(withLast?.options.body ?? "", /Standup/);
  assert.doesNotMatch(without?.options.body ?? "", /Standup/);
});

test("a break check-in reports remaining time, or copes without it", () => {
  const timed = buildCheckInNotification(
    { kind: "break", breakId: "b1", label: "Lunch", tag: null, remainingSec: 330 },
    prefs(),
    chrome,
    NOW,
  );
  const openEnded = buildCheckInNotification(
    { kind: "break", breakId: "b1", label: "Break", tag: null, remainingSec: null },
    prefs(),
    chrome,
    NOW,
  );

  assert.match(timed?.options.body ?? "", /6m left/);
  assert.doesNotMatch(openEnded?.options.body ?? "", /left/);
});

test("requireInteraction follows the preference", () => {
  assert.equal(
    buildCheckInNotification(running, prefs({ requireInteraction: true }), chrome, NOW)?.options
      .requireInteraction,
    true,
  );
  assert.equal(
    buildCheckInNotification(running, prefs({ requireInteraction: false }), chrome, NOW)?.options
      .requireInteraction,
    false,
  );
});

test("data round-trips the ids the service worker will hand back", () => {
  const built = buildCheckInNotification(running, prefs(), chrome, NOW);

  assert.deepEqual(built?.options.data, {
    kokuType: "check-in",
    timerId: "t1",
    breakId: null,
    createdAt: NOW,
  });
});

test("the tag is stable across contexts so repeats replace rather than stack", () => {
  const contexts: CheckInContext[] = [
    running,
    { ...running, kind: "timer-paused" },
    { kind: "break", breakId: "b1", label: "Break", tag: null, remainingSec: 60 },
    { kind: "idle", lastEntryTitle: null, idleForSec: null },
  ];

  for (const context of contexts) {
    const built = buildCheckInNotification(context, prefs(), chrome, NOW);
    assert.equal(built?.options.tag, NOTIFICATION_TAGS.checkIn, context.kind);
  }
});

/* ─── Break complete and test ─────────────────────────────────────────────── */

test("a finished break is never sticky", () => {
  const built = buildBreakCompleteNotification("Lunch", 1_800, NOW);

  assert.match(built.title, /Lunch finished/);
  assert.equal(built.options.requireInteraction, false);
  assert.equal(built.options.tag, NOTIFICATION_TAGS.break);
});

test("the test notification explains the no-buttons case on browsers without actions", () => {
  assert.match(buildTestNotification(prefs(), chrome, NOW).options.body ?? "", /Try the buttons/);
  assert.match(
    buildTestNotification(prefs(), noActions, NOW).options.body ?? "",
    /no buttons/,
  );
});


/* ─── End of day ──────────────────────────────────────────────────────────── */

test("end-of-day buttons are truncated to what the browser renders, not withheld", () => {
  // The previous version emitted nothing below two slots, which left the only
  // sticky notification koku sends with no way to answer it.
  const twoSlots = buildEndOfDayNotification(15, { maxActions: 2 }, 0);
  assert.deepEqual(
    twoSlots.options.actions?.map((action) => action.action),
    ["eod-stop", "eod-snooze"],
  );

  const roomy = buildEndOfDayNotification(15, { maxActions: 3 }, 0);
  assert.deepEqual(
    roomy.options.actions?.map((action) => action.action),
    ["eod-stop", "eod-snooze", "eod-keep"],
  );

  const one = buildEndOfDayNotification(15, { maxActions: 1 }, 0);
  assert.deepEqual(
    one.options.actions?.map((action) => action.action),
    ["eod-stop"],
  );
});

test("with no buttons the body explains that clicking keeps the timer running", () => {
  const noSlots = buildEndOfDayNotification(15, { maxActions: 0 }, 0);
  assert.deepEqual(noSlots.options.actions, []);
  assert.match(String(noSlots.options.body), /click here to keep it running/);
});

test("the wrap-up prompt stays in the tray until it is answered", () => {
  const built = buildEndOfDayNotification(15, { maxActions: 2 }, 0);
  assert.equal(built.options.requireInteraction, true);
  assert.equal(built.options.tag, NOTIFICATION_TAGS.endOfDay);
});

test("a snooze replaces the prompt on the same tag so the tray is never silent", () => {
  const built = buildEndOfDaySnoozedNotification(0, 0);
  assert.equal(built.options.tag, NOTIFICATION_TAGS.endOfDay);
  assert.equal(built.options.requireInteraction, false);
});
