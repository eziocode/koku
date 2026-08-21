import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  INTENT_PARAM,
  isNotificationIntent,
  isSwToPageMessage,
  NOTIFICATION_ACTION_IDS,
  PAGE_TO_SW_TYPES,
  SW_TO_PAGE_TYPES,
} from "./messages";

/* ─── Drift guard ─────────────────────────────────────────────────────────── */
/* `public/sw.js` is plain JavaScript and cannot import these unions, so renaming */
/* a member here would silently break notifications at runtime. Reading the worker */
/* and asserting the literals are still present turns that into a failing test.    */

const serviceWorkerSource = readFileSync("public/sw.js", "utf8");

test("every action id is still handled by the service worker", () => {
  for (const action of NOTIFICATION_ACTION_IDS) {
    assert.ok(
      serviceWorkerSource.includes(`"${action}"`),
      `public/sw.js no longer references the "${action}" action`,
    );
  }
});

test("every worker-to-page message type is still emitted by the service worker", () => {
  for (const type of SW_TO_PAGE_TYPES) {
    assert.ok(
      serviceWorkerSource.includes(`"${type}"`),
      `public/sw.js no longer emits "${type}"`,
    );
  }
});

test("every page-to-worker message type is still handled by the service worker", () => {
  for (const type of PAGE_TO_SW_TYPES) {
    assert.ok(
      serviceWorkerSource.includes(`"${type}"`),
      `public/sw.js no longer handles "${type}"`,
    );
  }
});

test("the intent query parameter matches the one the worker opens windows with", () => {
  assert.ok(
    serviceWorkerSource.includes(`INTENT_PARAM = "${INTENT_PARAM}"`),
    `public/sw.js does not define INTENT_PARAM as "${INTENT_PARAM}"`,
  );
});

test("the worker still declares both message sources it relies on", () => {
  assert.ok(serviceWorkerSource.includes('source: "koku-sw"'));
  assert.ok(serviceWorkerSource.includes('data.source !== "koku"'));
});

test("the development fetch bypass is still in place", () => {
  // Removing this makes `next dev` serve stale chunks and breaks HMR, which is
  // miserable and easy to reintroduce accidentally.
  assert.ok(serviceWorkerSource.includes("if (DEV) {"), "the DEV bypass has been removed");
});

/* ─── Message validation ──────────────────────────────────────────────────── */

test("accepts well-formed worker messages", () => {
  assert.equal(
    isSwToPageMessage({
      source: "koku-sw",
      type: "notification-action",
      action: "quick-note",
      tag: "koku-checkin",
      data: null,
    }),
    true,
  );
  assert.equal(isSwToPageMessage({ source: "koku-sw", type: "pong" }), true);
  assert.equal(
    isSwToPageMessage({ source: "koku-sw", type: "notification-dismissed", tag: "koku-checkin" }),
    true,
  );
});

test("rejects anything that is not one of our messages", () => {
  // The page listens on a shared channel, so unrelated postMessage traffic
  // (extensions, other libraries) must not be mistaken for an intent.
  const rejected: unknown[] = [
    null,
    undefined,
    "notification-action",
    42,
    {},
    { source: "elsewhere", type: "notification-action", action: "quick-note", tag: "t" },
    { source: "koku-sw", type: "unknown-type", tag: "t" },
    { source: "koku-sw", type: "notification-action", action: "delete-everything", tag: "t" },
    { source: "koku-sw", type: "notification-action", action: "quick-note" },
    { source: "koku-sw", type: "notification-dismissed" },
  ];

  for (const value of rejected) {
    assert.equal(isSwToPageMessage(value), false, JSON.stringify(value) ?? String(value));
  }
});

test("only the two real intents are accepted", () => {
  assert.equal(isNotificationIntent("quick-note"), true);
  assert.equal(isNotificationIntent("open-log"), true);
  assert.equal(isNotificationIntent("dismiss"), false);
  assert.equal(isNotificationIntent(""), false);
  assert.equal(isNotificationIntent(undefined), false);
});
