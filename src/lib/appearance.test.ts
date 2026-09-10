import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCENT_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_FONT,
  DEFAULT_SURFACE,
  FONT_KEYS,
  SURFACE_KEYS,
  buildAppearanceScript,
  isValidAccent,
  isValidFont,
  isValidSurface,
} from "./appearance";

const GUARDS = [
  { name: "accent", keys: ACCENT_KEYS, fallback: DEFAULT_ACCENT, isValid: isValidAccent },
  { name: "surface", keys: SURFACE_KEYS, fallback: DEFAULT_SURFACE, isValid: isValidSurface },
  { name: "font", keys: FONT_KEYS, fallback: DEFAULT_FONT, isValid: isValidFont },
] as const;

describe("appearance keys", () => {
  for (const { name, keys, fallback, isValid } of GUARDS) {
    it(`${name}: keys are unique and contain the default`, () => {
      assert.equal(new Set(keys).size, keys.length);
      assert.ok((keys as readonly string[]).includes(fallback));
    });

    it(`${name}: the guard accepts every key`, () => {
      for (const key of keys) assert.equal(isValid(key), true);
    });

    it(`${name}: the guard rejects anything else`, () => {
      // "toString" guards against a prototype-chain hit if the lookup ever
      // moves from an array to an object.
      for (const value of ["", " ", "TOAST", "toString", "__proto__", null, undefined, 0, {}, []]) {
        assert.equal(isValid(value), false, `expected ${JSON.stringify(value)} to be rejected`);
      }
    });
  }
});

describe("buildAppearanceScript", () => {
  const script = buildAppearanceScript();

  it("applies all three appearance attributes", () => {
    for (const attribute of ["data-accent", "data-surface", "data-font"]) {
      assert.ok(script.includes(`setAttribute("${attribute}"`), `${attribute} is never set`);
      assert.ok(script.includes(`removeAttribute("${attribute}")`), `${attribute} is never cleared`);
    }
  });

  it("carries every key and default so an unknown cached value falls back", () => {
    for (const { keys, fallback } of GUARDS) {
      for (const key of keys) assert.ok(script.includes(`"${key}"`), `${key} missing from script`);
      assert.ok(script.includes(`var d="${fallback}"`), `${fallback} is not used as a fallback`);
    }
  });

  it("reads each cache under its own name", () => {
    for (const name of ["koku-accent", "koku-surface", "koku-font"]) {
      assert.ok(script.includes(`localStorage.getItem("${name}")`), `${name} is never read`);
    }
  });

  it("guards every choice separately so one bad cache entry cannot block the rest", () => {
    // Three independent try/catch blocks, not one wrapping all three.
    assert.equal(script.split("try{").length - 1, GUARDS.length);
    assert.equal(script.split("catch(e){}").length - 1, GUARDS.length);
  });

  it("is a self-contained IIFE with no bare newlines", () => {
    assert.ok(script.startsWith("(function(){"));
    assert.ok(script.endsWith("})();"));
    assert.equal(script.includes("\n"), false);
  });
});
