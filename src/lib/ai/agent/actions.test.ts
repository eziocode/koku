import assert from "node:assert/strict";
import { test } from "node:test";

import { parseKokuActions } from "./actions";

test("plain text with no action block passes through unchanged", () => {
  const { cleanText, actions } = parseKokuActions("Sure, here's a summary of your week.");
  assert.equal(cleanText, "Sure, here's a summary of your week.");
  assert.deepEqual(actions, []);
});

test("extracts a single create_task action and strips the block from the text", () => {
  const raw = 'Done, I will add that task.\n<koku-action>{"type":"create_task","title":"Ship report","priority":"high"}</koku-action>';
  const { cleanText, actions } = parseKokuActions(raw);
  assert.equal(cleanText, "Done, I will add that task.");
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "create_task", title: "Ship report", priority: "high" });
});

test("extracts multiple action blocks in order", () => {
  const raw =
    '<koku-action>{"type":"log_time","title":"Standup","durationMinutes":15}</koku-action>' +
    '<koku-action>{"type":"create_note","title":"Ideas","content":"Explore X","tags":["ideas"]}</koku-action>';
  const { actions } = parseKokuActions(raw);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].type, "log_time");
  assert.equal(actions[1].type, "create_note");
});

test("a malformed action block is dropped silently rather than shown as raw JSON", () => {
  const raw = "Here you go.\n<koku-action>{not json</koku-action>";
  const { cleanText, actions } = parseKokuActions(raw);
  assert.equal(cleanText, "Here you go.");
  assert.deepEqual(actions, []);
});

test("an action failing schema validation (missing required field) is dropped", () => {
  const raw = '<koku-action>{"type":"log_time","title":"Standup"}</koku-action>';
  const { actions } = parseKokuActions(raw);
  assert.deepEqual(actions, []);
});
