import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_ACCENT,
  DEFAULT_FONT,
  DEFAULT_SURFACE,
  FONT_KEYS,
  SURFACE_KEYS,
} from "@/lib/appearance";

import { SETTING_DEFAULTS, parseSetting } from "./schema";

describe("appearance settings schema", () => {
  it("defaults the appearance keys to the no-attribute styles", () => {
    assert.equal(SETTING_DEFAULTS.accent, DEFAULT_ACCENT);
    assert.equal(SETTING_DEFAULTS.surface, DEFAULT_SURFACE);
    assert.equal(SETTING_DEFAULTS.fontStyle, DEFAULT_FONT);
  });

  it("passes every valid surface and font through untouched", () => {
    for (const key of SURFACE_KEYS) assert.equal(parseSetting("surface", key), key);
    for (const key of FONT_KEYS) assert.equal(parseSetting("fontStyle", key), key);
  });

  it("degrades unusable stored values to the default instead of throwing", () => {
    // A settings row can hold anything: an older build's key, a hand-edited
    // value, or a partially written sync payload.
    for (const value of ["mist", "", null, undefined, 3, {}, []]) {
      assert.equal(parseSetting("surface", value), DEFAULT_SURFACE);
      assert.equal(parseSetting("fontStyle", value), DEFAULT_FONT);
    }
  });
});
