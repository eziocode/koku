import { kokuDb } from "@/lib/storage/db";
import { syncRow } from "@/lib/sync/sync-engine";

export type PresencePayload = {
  seenAt: string;
  visible: boolean;
  focused: boolean;
  work: { title: string; startedAt: string } | null;
  break: { label: string; startedAt: string } | null;
};

export type PresenceState = Omit<PresencePayload, "seenAt">;
export type PresenceWrite = (payload: PresencePayload) => Promise<void>;

function signature(state: PresenceState): string {
  return JSON.stringify(state);
}

/** Serializes writes and keeps operational metadata from becoming a write storm. */
export function createPresenceWriter(write: PresenceWrite, now = () => new Date().toISOString()) {
  let savedSignature: string | null = null;
  let pending: { payload: PresencePayload; signature: string } | null = null;
  let inFlightSignature: string | null = null;
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const next = pending;
        pending = null;
        inFlightSignature = next.signature;
        try {
          await write(next.payload);
          savedSignature = next.signature;
        } finally {
          inFlightSignature = null;
        }
      }
    } finally {
      running = false;
      if (pending) void drain();
    }
  }

  return {
    publish(state: PresenceState, heartbeat = false) {
      const nextSignature = signature(state);
      if (!heartbeat && nextSignature === savedSignature) return false;
      if (!heartbeat && (pending?.signature === nextSignature || inFlightSignature === nextSignature)) return false;
      pending = { payload: { ...state, seenAt: now() }, signature: nextSignature };
      void drain();
      return true;
    },
  };
}

const writer = createPresenceWriter(async (payload) => {
  const row = { key: "adminPresence", value: payload };
  await kokuDb.settings.put(row);
  await syncRow("settings", row);
});

export function publishPresence(state: PresenceState, heartbeat = false) {
  return writer.publish(state, heartbeat);
}
