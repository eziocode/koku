"use client";

import { useEffect } from "react";

import { syncNow } from "@/lib/sync/sync-engine";

/** Pull cloud settings/data when browser opens, then retry after reconnect. */
export function CloudSyncBootstrap() {
  useEffect(() => {
    const sync = () => { void syncNow(); };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  return null;
}
