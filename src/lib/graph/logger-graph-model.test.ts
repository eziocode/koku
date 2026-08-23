import assert from "node:assert/strict";
import { test } from "node:test";

import { detectCommunities, getGraphColorByKey } from "./palette";
import {
  buildLoggerGraph,
  UNASSIGNED_CATEGORY_ID,
  UNASSIGNED_PROJECT_ID,
  type LoggerEntryInput,
} from "./logger-graph-model";

function entry(overrides: Partial<LoggerEntryInput> = {}): LoggerEntryInput {
  return {
    id: "e1",
    title: "Work",
    startAt: "2026-08-01T09:00:00.000Z",
    durationSec: 3600,
    tags: [],
    categoryId: "c1",
    categoryName: "Deep work",
    categoryColor: "#123456",
    projectId: "p1",
    projectName: "Website",
    projectColor: "#abcdef",
    ...overrides,
  };
}

test("aggregate shape links category, project, and tags", () => {
  const model = buildLoggerGraph([
    entry({ id: "e1", tags: ["Focus", "focus", " deep "] }),
  ]);

  const ids = model.nodes.map((node) => node.id).sort();
  assert.deepEqual(ids, ["category:c1", "project:p1", "tag:deep", "tag:focus"]);
  assert.equal(model.totalHours, 1);
  assert.equal(model.entryCount, 1);

  // category↔project plus category/project↔each tag
  assert.equal(model.edges.length, 5);
  assert.ok(model.edges.some((edge) => edge.id === "category:c1--project:p1"));
});

test("aggregate hours accumulate per node and per edge", () => {
  const model = buildLoggerGraph([
    entry({ id: "e1", durationSec: 3600 }),
    entry({ id: "e2", durationSec: 1800 }),
  ]);

  const category = model.nodes.find((node) => node.id === "category:c1");
  assert.equal(category?.hours, 1.5);
  assert.equal(category?.entryCount, 2);
  assert.equal(model.edges[0].hours, 1.5);
});

test("missing category and project fall back to unassigned nodes", () => {
  const model = buildLoggerGraph([
    entry({ categoryId: null, categoryName: null, categoryColor: null, projectId: null, projectName: null, projectColor: null }),
  ]);

  const category = model.nodes.find((node) => node.id === `category:${UNASSIGNED_CATEGORY_ID}`);
  const project = model.nodes.find((node) => node.id === `project:${UNASSIGNED_PROJECT_ID}`);
  assert.equal(category?.label, "Uncategorised");
  assert.equal(project?.label, "No project");
});

test("includeTags=false drops tag nodes", () => {
  const model = buildLoggerGraph([entry({ tags: ["focus"] })], { includeTags: false });
  assert.ok(!model.nodes.some((node) => node.kind === "tag"));
  assert.equal(model.edges.length, 1);
});

test("entries shape makes each entry the connector", () => {
  const model = buildLoggerGraph([entry({ id: "e1", tags: ["focus"] })], {
    shape: "entries",
  });

  assert.ok(model.nodes.some((node) => node.id === "entry:e1"));
  assert.deepEqual(
    model.edges.map((edge) => edge.id).sort(),
    ["category:c1--entry:e1", "entry:e1--project:p1", "entry:e1--tag:focus"],
  );
});

test("entries shape caps entry nodes and reports the overflow", () => {
  const model = buildLoggerGraph(
    [entry({ id: "e1" }), entry({ id: "e2" }), entry({ id: "e3" })],
    { shape: "entries", maxEntryNodes: 2 },
  );

  assert.equal(model.nodes.filter((node) => node.kind === "entry").length, 2);
  assert.equal(model.truncatedEntries, 1);
});

test("colour mode selects the palette source", () => {
  const byCategory = buildLoggerGraph([entry({ tags: ["focus"] })], { colorMode: "category" });
  assert.equal(byCategory.nodes.find((node) => node.kind === "category")?.color, "#123456");

  const byProject = buildLoggerGraph([entry({ tags: ["focus"] })], { colorMode: "project" });
  assert.equal(byProject.nodes.find((node) => node.kind === "project")?.color, "#abcdef");

  const byKind = buildLoggerGraph([entry()], { colorMode: "kind" });
  const category = byKind.nodes.find((node) => node.kind === "category");
  const project = byKind.nodes.find((node) => node.kind === "project");
  assert.notEqual(category?.color, project?.color);
});

test("nodes outside the grouping kind get a distinct variant of the group colour", () => {
  const model = buildLoggerGraph([entry({ tags: ["focus", "deep"] })], {
    colorMode: "category",
  });

  const colors = new Set(model.nodes.map((node) => node.color));
  // category, project, and two tags must not collapse into one flat colour
  assert.ok(colors.size >= 3, `expected varied colours, got ${colors.size}`);
});

test("unassigned nodes get per-node hues and the group is marked mixed", () => {
  const model = buildLoggerGraph([
    entry({
      id: "e1",
      tags: ["focus"],
      categoryId: null,
      categoryName: null,
      categoryColor: null,
    }),
  ]);

  const colors = new Set(model.nodes.map((node) => node.color));
  assert.ok(colors.size > 1);
  assert.equal(model.groups.find((group) => group.label === "Uncategorised")?.mixed, true);
});

test("categories without a stored colour get a deterministic palette colour", () => {
  const model = buildLoggerGraph([entry({ categoryColor: null })]);
  const category = model.nodes.find((node) => node.kind === "category");
  assert.equal(category?.color, getGraphColorByKey("c1"));
});

test("groups summarise hours per colour bucket", () => {
  const model = buildLoggerGraph([
    entry({ id: "e1", categoryId: "c1", categoryName: "Deep work", durationSec: 3600 }),
    entry({ id: "e2", categoryId: "c2", categoryName: "Meetings", categoryColor: "#654321", durationSec: 1800 }),
  ]);

  assert.deepEqual(
    model.groups.map((group) => group.label),
    ["Deep work", "Meetings"],
  );
});

test("community detection is deterministic and separates disconnected clusters", () => {
  const nodes = ["a", "b", "c", "d", "e"];
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "d", target: "e" },
  ];

  const first = detectCommunities(nodes, edges);
  const second = detectCommunities(nodes, edges);

  assert.deepEqual(Array.from(first.entries()), Array.from(second.entries()));
  assert.equal(first.get("a"), first.get("c"));
  assert.notEqual(first.get("a"), first.get("d"));
});
