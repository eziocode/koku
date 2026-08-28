import assert from "node:assert/strict";
import { test } from "node:test";

import { filterByQuery, matchRank, normalizeText } from "./match";

test("normalizeText trims and lowercases", () => {
  assert.equal(normalizeText("  Acme Corp  "), "acme corp");
});

test("matchRank ranks exact above prefix above word-prefix above substring above subsequence", () => {
  assert.equal(matchRank("acme", "Acme"), 4);
  assert.equal(matchRank("acm", "Acme Corp"), 3);
  assert.equal(matchRank("cor", "Acme Corp"), 2);
  assert.equal(matchRank("me c", "Acme Corp"), 1);
  assert.equal(matchRank("acp", "Acme Corp"), 0.5);
  assert.equal(matchRank("xyz", "Acme Corp"), null);
});

test("empty query matches everything at rank 0", () => {
  assert.equal(matchRank("", "anything"), 0);
});

test("filterByQuery returns the input array by identity when query is empty", () => {
  const items = [{ name: "a" }];
  assert.equal(filterByQuery(items, "", (i) => i.name), items);
  assert.equal(filterByQuery(items, "   ", (i) => i.name), items);
});

test("filterByQuery ranks matches and drops non-matches", () => {
  const items = [{ name: "Coffee Break" }, { name: "Acme Corp" }, { name: "Beta" }];
  const result = filterByQuery(items, "ac", (i) => i.name);
  assert.deepEqual(
    result.map((i) => i.name),
    ["Acme Corp"],
  );
});

test("filterByQuery considers extraKeywords and takes the best rank", () => {
  const items = [
    { name: "Standup", project: "Zeta" },
    { name: "Retro", project: "Acme" },
  ];
  const result = filterByQuery(
    items,
    "acme",
    (i) => i.name,
    (i) => [i.project],
  );
  assert.deepEqual(
    result.map((i) => i.name),
    ["Retro"],
  );
});
