import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TABLE_CONFIG, validateSyncRow } from "./table-config";

describe("sync row validation", () => {
  it("accepts valid projects and categories", () => {
    assert.deepEqual(
      validateSyncRow("projects", {
        id: "project-1",
        name: "Koku",
        color: "#123456",
        hourlyRate: null,
        createdAt: "2026-08-24T10:00:00.000Z",
      }),
      {
        ok: true,
        id: "project-1",
        row: {
          id: "project-1",
          name: "Koku",
          color: "#123456",
          hourlyRate: null,
          createdAt: "2026-08-24T10:00:00.000Z",
        },
      },
    );

    assert.equal(
      validateSyncRow("categories", {
        id: "category-1",
        name: "Development",
        color: "#abcdef",
        createdAt: "2026-08-24T10:00:00.000Z",
      }).ok,
      true,
    );
  });

  it("rejects rows before they reach Catalyst when required fields are missing", () => {
    assert.deepEqual(
      validateSyncRow("projects", {
        id: "project-1",
        name: "",
        color: "#123456",
        createdAt: "2026-08-24T10:00:00.000Z",
      }),
      { ok: false, error: "name must be a non-empty string." },
    );
    assert.deepEqual(
      validateSyncRow("categories", null),
      { ok: false, error: "Row must be an object." },
    );
  });
});

describe("Catalyst field transforms", () => {
  it("maps personal notes to their dedicated private cloud table payload", () => {
    assert.deepEqual(
      TABLE_CONFIG.personalNotes.toFields({
        id: "personal-1",
        title: "Private thought",
        slug: "private-thought",
        content: { type: "doc" },
        tags: ["private"],
        createdAt: "2026-08-24T10:00:00.000Z",
        updatedAt: "2026-08-24T10:05:00.000Z",
      }),
      {
        title: "Private thought",
        slug: "private-thought",
        content: JSON.stringify({ type: "doc" }),
        tags: JSON.stringify(["private"]),
        created_at: "2026-08-24T10:00:00.000Z",
        updated_at: "2026-08-24T10:05:00.000Z",
      },
    );
  });

  it("preserves nullable numeric and relation fields instead of sending empty strings", () => {
    assert.deepEqual(
      TABLE_CONFIG.projects.toFields({
        name: "Koku",
        color: "#123456",
        hourlyRate: null,
        createdAt: "2026-08-24T10:00:00.000Z",
      }),
      {
        name: "Koku",
        color: "#123456",
        hourly_rate: null,
        created_at: "2026-08-24T10:00:00.000Z",
      },
    );

    const fields = TABLE_CONFIG.timeEntries.toFields({
      id: "entry-1",
      title: "Work",
      projectId: null,
      categoryId: null,
      startAt: "2026-08-24T10:00:00.000Z",
      endAt: null,
      durationSec: null,
      tags: [],
      notes: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    });
    assert.equal(fields.project_id, null);
    assert.equal(fields.category_id, null);
    assert.equal(fields.end_at, null);
    assert.equal(fields.duration_sec, null);
    assert.equal(fields.start_at, "2026-08-24 10:00:00");
  });
});
