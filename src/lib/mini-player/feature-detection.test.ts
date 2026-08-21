import assert from "node:assert/strict";
import { test } from "node:test";

import { detectMiniPlayerCapabilities, isMiniPlayerSupported } from "./feature-detection";

test("reports nothing supported when there is no window at all", () => {
  // Server render must never claim support, or hydration mismatches.
  const capabilities = detectMiniPlayerCapabilities(undefined);

  assert.deepEqual(capabilities, {
    documentPictureInPicture: false,
    broadcastChannel: false,
    webLocks: false,
  });
  assert.equal(isMiniPlayerSupported(capabilities), false);
});

test("detects a Chromium-like scope", () => {
  const capabilities = detectMiniPlayerCapabilities({
    documentPictureInPicture: { requestWindow: () => undefined },
    BroadcastChannel: function BroadcastChannel() {},
    navigator: { locks: {} },
  });

  assert.deepEqual(capabilities, {
    documentPictureInPicture: true,
    broadcastChannel: true,
    webLocks: true,
  });
  assert.equal(isMiniPlayerSupported(capabilities), true);
});

test("a scope without the PiP API is unsupported, whatever else it has", () => {
  const capabilities = detectMiniPlayerCapabilities({
    BroadcastChannel: function BroadcastChannel() {},
    navigator: { locks: {} },
  });

  assert.equal(capabilities.documentPictureInPicture, false);
  assert.equal(isMiniPlayerSupported(capabilities), false);
});

test("an object without a callable requestWindow does not count as support", () => {
  // Guards against a partial shim or a polyfill stub declaring the namespace.
  for (const pip of [{}, { requestWindow: "nope" }, null, "yes", 1]) {
    assert.equal(
      detectMiniPlayerCapabilities({ documentPictureInPicture: pip }).documentPictureInPicture,
      false,
      JSON.stringify(pip) ?? String(pip),
    );
  }
});

test("the fallback capabilities are independent of PiP support", () => {
  const capabilities = detectMiniPlayerCapabilities({
    documentPictureInPicture: { requestWindow: () => undefined },
  });

  assert.equal(capabilities.documentPictureInPicture, true);
  assert.equal(capabilities.broadcastChannel, false);
  assert.equal(capabilities.webLocks, false);
  // Missing fallbacks must not disable the feature itself.
  assert.equal(isMiniPlayerSupported(capabilities), true);
});
