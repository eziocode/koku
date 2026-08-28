import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTitleIndex, findTitleSuggestion, type TitleSeed } from "./title-suggestions";

function seed(overrides: Partial<TitleSeed> = {}): TitleSeed {
  return {
    title: "Client sync call",
    projectId: "p1",
    categoryId: "c1",
    tags: ["call"],
    at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

test("a query under the minimum length returns nothing", () => {
  const index = buildTitleIndex([seed()]);
  assert.equal(findTitleSuggestion(index, "cl"), null);
});

test("an exact normalized match returns the group's most recent assignment", () => {
  const index = buildTitleIndex([
    seed({ projectId: "old", at: "2026-08-01T10:00:00.000Z" }),
    seed({ projectId: "new", at: "2026-08-10T10:00:00.000Z" }),
  ]);

  const suggestion = findTitleSuggestion(index, "Client Sync Call");
  assert.equal(suggestion?.projectId, "new");
  assert.equal(suggestion?.count, 2);
});

test("recency beats majority for project/category", () => {
  const index = buildTitleIndex([
    seed({ projectId: "majority", at: "2026-08-01T10:00:00.000Z" }),
    seed({ projectId: "majority", at: "2026-08-02T10:00:00.000Z" }),
    seed({ projectId: "newest", at: "2026-08-20T10:00:00.000Z" }),
  ]);

  assert.equal(findTitleSuggestion(index, "Client sync call")?.projectId, "newest");
});

test("tags need majority presence to survive, capped at 5", () => {
  const index = buildTitleIndex([
    seed({ tags: ["call", "urgent"] }),
    seed({ tags: ["call"] }),
    seed({ tags: ["call"] }),
    seed({ tags: ["rare"] }),
  ]);

  const suggestion = findTitleSuggestion(index, "Client sync call");
  assert.deepEqual(suggestion?.tags, ["call"]);
});

test("a prefix match of 4+ chars picks the highest-count group, tie-broken by recency", () => {
  const index = buildTitleIndex([
    ...Array.from({ length: 3 }, () => seed({ title: "Client sync call" })),
    seed({ title: "Client onboarding", projectId: "onboard", at: "2026-08-15T10:00:00.000Z" }),
  ]);

  assert.equal(findTitleSuggestion(index, "Client")?.title, "Client sync call");
});

test("a prefix under 4 chars is not matched by prefix, only exact/fuzzy", () => {
  const index = buildTitleIndex([seed()]);
  assert.equal(findTitleSuggestion(index, "cli"), null);
});

test("a fuzzy match within the length band and token similarity is found", () => {
  const index = buildTitleIndex([seed({ title: "Client sync call" })]);
  const suggestion = findTitleSuggestion(index, "Cliant sync call");
  assert.equal(suggestion?.title, "Client sync call");
});

test("a winner with no project, category, or tags is not suggested", () => {
  const index = buildTitleIndex([
    seed({ title: "Idle thought", projectId: null, categoryId: null, tags: [] }),
  ]);
  assert.equal(findTitleSuggestion(index, "Idle thought"), null);
});

test("an empty index never throws and returns null", () => {
  const index = buildTitleIndex([]);
  assert.equal(findTitleSuggestion(index, "Anything long enough"), null);
});
