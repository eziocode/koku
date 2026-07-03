import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AiRequestError,
  parseApiKey,
  parseMessages,
  parseMonthlyEntries,
  parseNotes,
  parseProvider,
  parseStandupEntries,
} from "./request-validation";

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_API_KEY_LENGTH = 4_096;
const MAX_NOTES = 8;
const MAX_NOTE_CONTENT_CHARS = 600;
const MAX_ENTRIES = 240;

describe("parseApiKey", () => {
  it("trims surrounding whitespace", () => {
    assert.equal(parseApiKey("  sk-test  "), "sk-test");
  });

  it("rejects empty or whitespace-only credentials", () => {
    assert.throws(() => parseApiKey("   "), AiRequestError);
    assert.throws(() => parseApiKey(""), AiRequestError);
    assert.throws(() => parseApiKey(undefined), AiRequestError);
  });

  it("accepts a key exactly at the length limit", () => {
    const key = "k".repeat(MAX_API_KEY_LENGTH);
    assert.equal(parseApiKey(key).length, MAX_API_KEY_LENGTH);
  });

  it("rejects a key over the length limit", () => {
    const key = "k".repeat(MAX_API_KEY_LENGTH + 1);
    assert.throws(() => parseApiKey(key), /too long/);
  });

  it("accepts a padded key whose trimmed length is within the limit", () => {
    const key = ` ${"k".repeat(MAX_API_KEY_LENGTH)} `;
    assert.equal(parseApiKey(key).length, MAX_API_KEY_LENGTH);
  });
});

describe("parseProvider", () => {
  it("accepts a known provider", () => {
    assert.equal(parseProvider("openai"), "openai");
  });

  it("rejects unknown providers", () => {
    assert.throws(() => parseProvider("nope"), AiRequestError);
    assert.throws(() => parseProvider(42), AiRequestError);
  });
});

describe("parseMessages", () => {
  it("keeps only the last MAX_MESSAGES entries", () => {
    const many = Array.from({ length: MAX_MESSAGES + 10 }, (_, i) => ({
      role: "user",
      content: `m${i}`,
    }));
    const parsed = parseMessages(many);
    assert.equal(parsed.length, MAX_MESSAGES);
    assert.equal(parsed[parsed.length - 1].content, `m${MAX_MESSAGES + 9}`);
  });

  it("truncates content to MAX_MESSAGE_CHARS", () => {
    const [msg] = parseMessages([{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 50) }]);
    assert.equal(msg.content.length, MAX_MESSAGE_CHARS);
  });

  it("drops invalid roles and empty content", () => {
    const parsed = parseMessages([
      { role: "bogus", content: "hi" },
      { role: "user", content: "   " },
      { role: "assistant", content: "ok" },
    ]);
    assert.deepEqual(parsed, [{ role: "assistant", content: "ok" }]);
  });

  it("returns [] for non-arrays", () => {
    assert.deepEqual(parseMessages("nope"), []);
  });
});

describe("parseNotes", () => {
  it("extracts plain text from a TipTap doc, ignoring scaffolding", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "paragraph", content: [{ type: "text", text: "world" }] },
      ],
    };
    const [note] = parseNotes([{ title: "T", tags: ["a"], content: doc }]);
    assert.equal(note.contentPreview, "Hello world");
    assert.ok(!note.contentPreview.includes("doc"));
    assert.ok(!note.contentPreview.includes("paragraph"));
  });

  it("caps the number of notes and content length", () => {
    const notes = Array.from({ length: MAX_NOTES + 5 }, () => ({
      title: "T",
      tags: [],
      content: "y".repeat(MAX_NOTE_CONTENT_CHARS + 100),
    }));
    const parsed = parseNotes(notes);
    assert.equal(parsed.length, MAX_NOTES);
    assert.ok(parsed[0].contentPreview.length <= MAX_NOTE_CONTENT_CHARS);
  });

  it("falls back to 'Untitled note' when title missing", () => {
    const [note] = parseNotes([{ tags: [], content: "text" }]);
    assert.equal(note.title, "Untitled note");
  });
});

describe("parseStandupEntries / parseMonthlyEntries", () => {
  it("drops entries without a title and caps count", () => {
    const entries = [
      { title: "", durationSec: 10 },
      { title: "Work", durationSec: 5 },
    ];
    assert.equal(parseStandupEntries(entries).length, 1);
    assert.equal(parseMonthlyEntries(entries).length, 1);
  });

  it("clamps negative or non-finite durations to 0", () => {
    const [entry] = parseStandupEntries([{ title: "X", durationSec: -99 }]);
    assert.equal(entry.durationSec, 0);
    const [entry2] = parseStandupEntries([{ title: "X", durationSec: Number.NaN }]);
    assert.equal(entry2.durationSec, 0);
  });

  it("respects the MAX_ENTRIES cap", () => {
    const entries = Array.from({ length: MAX_ENTRIES + 20 }, () => ({ title: "t", durationSec: 1 }));
    assert.equal(parseStandupEntries(entries).length, MAX_ENTRIES);
  });
});
