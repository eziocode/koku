import assert from "node:assert/strict";
import { test } from "node:test";

import { toCatalystDateTime } from "./catalyst-datetime";

test("converts ISO dates to Catalyst DateTime values", () => {
  assert.equal(toCatalystDateTime("2026-08-25T15:31:57.687Z"), "2026-08-25 15:31:57");
});

test("rejects invalid timestamps", () => {
  assert.equal(toCatalystDateTime("not-a-date"), null);
  assert.equal(toCatalystDateTime(null), null);
});
