import assert from "node:assert/strict";
import { test } from "node:test";

import { isLeaseStale, parseLease, resolveFallbackOwner, type LeaseRecord } from "./leader";

const NOW = Date.parse("2026-08-21T14:00:00.000Z");

function lease(ownerId: string, expiresAt: number): LeaseRecord {
  return { ownerId, expiresAt };
}

test("parses a well-formed lease", () => {
  assert.deepEqual(parseLease(JSON.stringify({ ownerId: "a", expiresAt: NOW })), {
    ownerId: "a",
    expiresAt: NOW,
  });
});

test("rejects malformed leases rather than trusting them", () => {
  // A garbage lease must read as "no lease", so a tab can take over. Treating it
  // as valid would leave every tab a follower and silence notifications entirely.
  for (const raw of [
    null,
    "",
    "not json",
    "[]",
    JSON.stringify({ ownerId: "a" }),
    JSON.stringify({ expiresAt: NOW }),
    JSON.stringify({ ownerId: 1, expiresAt: NOW }),
    JSON.stringify({ ownerId: "a", expiresAt: "soon" }),
  ]) {
    assert.equal(parseLease(raw), null, String(raw));
  }
});

test("a missing or expired lease is stale", () => {
  assert.equal(isLeaseStale(null, NOW), true);
  assert.equal(isLeaseStale(lease("a", NOW - 1), NOW), true);
  assert.equal(isLeaseStale(lease("a", NOW), NOW), true);
  assert.equal(isLeaseStale(lease("a", NOW + 1), NOW), false);
});

test("a stale lease is claimable by whoever notices first", () => {
  assert.equal(resolveFallbackOwner("tab-a", null, NOW), "leader");
  assert.equal(resolveFallbackOwner("tab-b", lease("tab-a", NOW - 1_000), NOW), "leader");
});

test("the existing owner keeps a live lease", () => {
  assert.equal(resolveFallbackOwner("tab-a", lease("tab-a", NOW + 5_000), NOW), "leader");
  assert.equal(resolveFallbackOwner("tab-b", lease("tab-a", NOW + 5_000), NOW), "follower");
});

test("ties resolve deterministically, so two claimants converge instead of flapping", () => {
  const live = NOW + 5_000;

  // Lower id wins, and crucially both tabs compute the same answer.
  assert.equal(resolveFallbackOwner("tab-a", lease("tab-b", live), NOW), "leader");
  assert.equal(resolveFallbackOwner("tab-b", lease("tab-a", live), NOW), "follower");
});

test("exactly one of two racing tabs ends up leading", () => {
  const live = NOW + 5_000;
  const [a, b] = ["tab-a", "tab-b"];

  const results = [
    resolveFallbackOwner(a, lease(b, live), NOW),
    resolveFallbackOwner(b, lease(a, live), NOW),
  ];

  assert.equal(results.filter((status) => status === "leader").length, 1);
});
