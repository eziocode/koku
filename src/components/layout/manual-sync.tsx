"use client";

import { Cloud, Database, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkForAppUpdate } from "@/components/layout/app-update-indicator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  cancelSyncConflict,
  checkSyncStatus,
  syncNow,
  type SyncConflict,
} from "@/lib/sync/sync-engine";
import { toast } from "@/components/ui/toast";

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
type SyncActivity = "idle" | "checking" | "syncing";

export function ManualSync() {
  const [cloudConnected, setCloudConnected] = useState<boolean | null>(isLocalMode ? false : null);
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [activity, setActivity] = useState<SyncActivity>("idle");
  const resolvingConflictRef = useRef(false);
  const busy = activity !== "idle";

  useEffect(() => {
    if (isLocalMode) return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ user?: unknown | null }>)
      .then((body) => setCloudConnected(Boolean(body.user)))
      .catch(() => setCloudConnected(false));
  }, []);

  async function choose(choice: "local" | "cloud") {
    if (busy) return;
    resolvingConflictRef.current = true;
    setActivity("syncing");
    setOpen(false);
    setConflict(null);
    try {
      const result = await syncNow(choice);
      checkForAppUpdate();
      if (result.error) toast.error(result.error);
      else if (result.pushed === 0 && result.pulled === 0) toast.success("Already in sync.");
      else toast.success(`Sync complete: ${result.pushed} sent, ${result.pulled} received.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sync failed."); }
    finally {
      cancelSyncConflict();
      resolvingConflictRef.current = false;
      setActivity("idle");
    }
  }

  async function openSync() {
    if (busy) return;
    setActivity("checking");
    try {
      const result = await checkSyncStatus();
      checkForAppUpdate();
      if (result.conflict) {
        setConflict(result.conflict);
        setOpen(true);
      } else if (result.error) {
        toast.error(result.error);
      } else {
        setConflict(null);
        toast.success("Already in sync.");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sync check failed."); }
    finally { setActivity("idle"); }
  }

  if (!cloudConnected) return null;

  return <>
    <Button
      variant="ghost"
      size="icon"
      aria-label={activity === "checking" ? "Checking cloud and local data" : activity === "syncing" ? "Syncing cloud and local data" : "Sync cloud and local data"}
      aria-busy={busy}
      onClick={() => void openSync()}
      disabled={busy}
    >
      <RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : ""} />
    </Button>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !resolvingConflictRef.current) {
          cancelSyncConflict();
          setConflict(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader><DialogTitle>Sync Koku</DialogTitle><DialogDescription>{conflict ? `${conflict.total} differences found. Choose source of truth.` : "Choose sync direction."}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="outline" className="h-20 justify-start" disabled={busy} onClick={() => void choose("local")}><Database /> Local → Cloud</Button>
          <Button className="h-20 justify-start" disabled={busy} onClick={() => void choose("cloud")}><Cloud /> Cloud → Local</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
