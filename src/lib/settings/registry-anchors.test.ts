import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { SETTINGS_ENTRIES } from "./registry";

/**
 * The drift guard for anchors TypeScript cannot see.
 *
 * `ToggleRow` takes a `settingId` typed as a union of registry anchors, so those
 * are already a compile error when they go stale. Selects, inputs, and the
 * option grids carry a hand-written `id=` instead, and nothing else would notice
 * one being renamed until a deep link quietly stopped scrolling anywhere.
 *
 * A string scan rather than a DOM assertion on purpose: the test runner here is
 * `tsx --test` over `src/**\/*.test.ts`, with no jsdom and no React renderer, so
 * rendering a component would mean new dependencies for a weaker check.
 */
const SETTINGS_DIR = path.join(process.cwd(), "src/components/settings");

function collectSources(dir: string): string {
  let out = "";
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      out += collectSources(full);
    } else if (item.name.endsWith(".tsx")) {
      out += readFileSync(full, "utf8");
    }
  }
  return out;
}

test("every registered anchor exists as an id in the settings components", () => {
  const sources = collectSources(SETTINGS_DIR);

  for (const entry of SETTINGS_ENTRIES) {
    if (entry.kind === "toggle") {
      // Rendered by ToggleRow from the registry itself; the union type already
      // guarantees it, and there is no literal `id="…"` to find.
      continue;
    }

    assert.ok(
      sources.includes(`id="${entry.anchorId}"`),
      `${entry.anchorId} is in the registry but no component renders id="${entry.anchorId}"`,
    );
  }
});

test("every anchor that a deep link targets can be scrolled to", () => {
  const sources = collectSources(SETTINGS_DIR);

  // A highlight scrolls the nearest [data-setting-row] ancestor, falling back to
  // the element itself. Toggles get theirs from ToggleRow; everything else needs
  // one placed by hand, so make sure enough of them exist to go around.
  const rowMarkers = sources.match(/data-setting-row/g) ?? [];
  const nonToggle = SETTINGS_ENTRIES.filter((entry) => entry.kind !== "toggle");

  assert.ok(
    rowMarkers.length >= nonToggle.length,
    `${nonToggle.length} non-toggle settings but only ${rowMarkers.length} data-setting-row markers`,
  );
});
