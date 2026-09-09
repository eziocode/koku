import assert from "node:assert/strict";
import { test } from "node:test";

import { DASHBOARD_TIPS } from "../dashboard/tips";
import { filterByQuery } from "../search/match";
import {
  HIGHLIGHT_PARAM,
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  SETTINGS_SECTIONS_BY_ID,
  entriesForSection,
  isSettingsAnchorId,
  sectionsForHub,
  settingHref,
  type SettingsEntry,
} from "./registry";

/**
 * Sections that are deliberately searchable only as a whole: they are hubs, or
 * pages whose controls all operate on user data (a project, an API key) rather
 * than on a setting. Anything else with no entries is an unindexed page.
 */
const SECTIONS_WITHOUT_ENTRIES = new Set([
  "notifications",
  "account",
  "projects",
  "ai-keys",
  "storage",
  "shortcuts",
]);

test("anchor ids are unique", () => {
  const seen = new Set<string>();
  for (const entry of SETTINGS_ENTRIES) {
    assert.ok(!seen.has(entry.anchorId), `duplicate anchorId: ${entry.anchorId}`);
    seen.add(entry.anchorId);
  }
});

test("section ids are unique", () => {
  const seen = new Set<string>();
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(!seen.has(section.id), `duplicate section id: ${section.id}`);
    seen.add(section.id);
  }
});

test("every entry belongs to a real section", () => {
  for (const entry of SETTINGS_ENTRIES) {
    assert.ok(
      SETTINGS_SECTIONS_BY_ID[entry.sectionId],
      `${entry.anchorId} points at unknown section ${entry.sectionId}`,
    );
  }
});

test("every section route lives under /settings", () => {
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(section.href.startsWith("/settings"), `${section.id}: ${section.href}`);
  }
});

test("every section belongs to exactly one hub", () => {
  assert.equal(
    sectionsForHub("root").length + sectionsForHub("notifications").length,
    SETTINGS_SECTIONS.length,
  );
});

test("every section is indexed, or is explicitly exempt", () => {
  for (const section of SETTINGS_SECTIONS) {
    const indexed = entriesForSection(section.id).length > 0;
    const exempt = SECTIONS_WITHOUT_ENTRIES.has(section.id);
    assert.ok(
      indexed !== exempt,
      indexed
        ? `${section.id} has entries but is listed as exempt`
        : `${section.id} has no entries — index its controls, or add it to SECTIONS_WITHOUT_ENTRIES`,
    );
  }
});

test("settingHref points at the section route with the anchor attached", () => {
  const entry = SETTINGS_ENTRIES.find((e) => e.anchorId === "checkin-enabled");
  assert.ok(entry);
  assert.equal(
    settingHref(entry),
    `/settings/notifications/check-ins?${HIGHLIGHT_PARAM}=checkin-enabled`,
  );
});

test("isSettingsAnchorId accepts real anchors and rejects anything else", () => {
  assert.ok(isSettingsAnchorId("checkin-enabled"));
  assert.ok(!isSettingsAnchorId("not-a-setting"));
  // Guards against a prototype key being mistaken for a registered anchor.
  assert.ok(!isSettingsAnchorId("toString"));
});

/**
 * The reason `keywords` exists. Each of these is a phrase someone would type
 * that appears nowhere in the control's own label, so an unkeyworded registry
 * fails here rather than silently returning nothing useful.
 */
test("synonym searches surface the right control", () => {
  const cases: Array<[query: string, expected: string]> = [
    ["logoff", "eod-logoff-time"],
    ["grace period", "eod-grace-period"],
    ["dnd", "dnd-controls"],
    ["chime", "sound-enabled"],
    ["how often", "checkin-interval"],
    ["vacation", "leave-dates"],
    ["weekend", "silent-days"],
    ["dark mode", "appearance-theme"],
  ];

  for (const [query, expected] of cases) {
    const results = filterByQuery(
      [...SETTINGS_ENTRIES] as SettingsEntry[],
      query,
      (entry) => entry.label,
      // Mirrors SettingsSearch: descriptions are not indexed, because
      // matchRank's subsequence tier turns long prose into a match for
      // almost anything.
      (entry) => [SETTINGS_SECTIONS_BY_ID[entry.sectionId].title, ...(entry.keywords ?? [])],
    );
    assert.ok(results.length > 0, `"${query}" matched nothing`);
    assert.equal(
      results[0].anchorId,
      expected,
      `"${query}" ranked ${results[0].anchorId} above ${expected}`,
    );
  }
});

test("every dashboard tip highlight names a real setting", () => {
  const sectionHrefs = new Set<string>(SETTINGS_SECTIONS.map((section) => section.href));

  for (const tip of DASHBOARD_TIPS) {
    const [path, search] = tip.href.split("?");
    if (!search) {
      continue;
    }

    const highlight = new URLSearchParams(search).get(HIGHLIGHT_PARAM);
    if (highlight === null) {
      continue;
    }

    assert.ok(isSettingsAnchorId(highlight), `tip ${tip.id}: unknown anchor ${highlight}`);
    assert.ok(sectionHrefs.has(path), `tip ${tip.id}: ${path} is not a settings section`);

    // The anchor has to live on the page the tip actually opens, or the reader
    // lands somewhere the highlight can never resolve.
    const entry = SETTINGS_ENTRIES.find((e) => e.anchorId === highlight);
    assert.ok(entry);
    assert.equal(
      SETTINGS_SECTIONS_BY_ID[entry.sectionId].href,
      path,
      `tip ${tip.id}: ${highlight} lives on a different page`,
    );
  }
});
