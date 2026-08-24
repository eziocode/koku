import { test } from "node:test";
import assert from "node:assert/strict";

import { createPresenceWriter, type PresenceState } from "@/lib/presence/presence-writer";

const idle: PresenceState = {
  visible: true,
  focused: true,
  work: null,
  break: null,
};

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

test("presence writer writes initial state and skips identical events", async () => {
  const writes: unknown[] = [];
  const writer = createPresenceWriter(async (payload) => { writes.push(payload); }, () => "2026-08-24T00:00:00.000Z");

  assert.equal(writer.publish(idle), true);
  await tick();
  assert.equal(writer.publish(idle), false);
  await tick();
  assert.equal(writes.length, 1);
});

test("presence writer serializes concurrent changes and keeps latest state", async () => {
  const writes: PresenceState[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const writer = createPresenceWriter(async (payload) => {
    writes.push({ visible: payload.visible, focused: payload.focused, work: payload.work, break: payload.break });
    if (writes.length === 1) await blocked;
  });

  writer.publish(idle);
  await tick();
  writer.publish({ ...idle, focused: false });
  writer.publish({ ...idle, focused: true, work: { title: "Focus", startedAt: "2026-08-24T00:00:00.000Z" } });
  release();
  await tick();
  await tick();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].work, { title: "Focus", startedAt: "2026-08-24T00:00:00.000Z" });
});

test("heartbeat forces fresh timestamp without changing semantic state", async () => {
  const writes: string[] = [];
  let count = 0;
  const writer = createPresenceWriter(async (payload) => { writes.push(payload.seenAt); }, () => `t${++count}`);

  writer.publish(idle);
  await tick();
  writer.publish(idle, true);
  await tick();
  assert.deepEqual(writes, ["t1", "t2"]);
});
