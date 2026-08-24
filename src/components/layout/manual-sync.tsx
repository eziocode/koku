"use client";

import { Cloud, Database, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { syncNow, type SyncConflict } from "@/lib/sync/sync-engine";
import { toast } from "@/components/ui/toast";

export function ManualSync() {
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(choice: "local" | "cloud") {
    setBusy(true);
    try {
      const result = await syncNow(choice);
      if (result.error) toast.error(result.error);
      else { toast.success(`Sync complete: ${result.pushed} sent, ${result.pulled} received.`); setOpen(false); setConflict(null); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sync failed."); }
    finally { setBusy(false); }
  }

  async function openSync() {
    setBusy(true);
    try {
      const result = await syncNow();
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
    finally { setBusy(false); }
  }

  return <>
    <Button variant="ghost" size="icon" aria-label="Sync cloud and local data" onClick={() => void openSync()} disabled={busy}>
      <RefreshCw className={busy ? "animate-spin" : ""} />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
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
