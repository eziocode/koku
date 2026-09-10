"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArchiveRestore, Download, HardDrive, ShieldCheck, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ManualSync } from "@/components/layout/manual-sync";
import { kokuDb } from "@/lib/storage/db";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { BACKUP_TABLES, createBackup, parseBackup, restoreBackup, type BackupPayload } from "@/lib/storage/backup";
import { flushNoteSaves } from "@/lib/storage/note-saves";
import { migrateTimers } from "@/lib/stores/timer-migrations";
import { buildEntryFromTimer } from "@/lib/time-tracking/stop-timer";
import { createTimeEntry } from "@/lib/time-tracking/time-entries";
import { localTransaction } from "@/lib/storage/local-write";

/** Quota/persistence read is a browser API, so it lives outside React state. */
async function readStorageStatus() {
  const estimate = await navigator.storage?.estimate();
  return {
    persisted: (await navigator.storage?.persisted()) ?? false,
    usage: estimate?.usage ?? 0,
    quota: estimate?.quota ?? 0,
  };
}

export function StorageSettingsManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [preview, setPreview] = useState<BackupPayload | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);
  const counts = useLiveQuery(async () => Promise.all(BACKUP_TABLES.filter((name) => !["aiKeys", "settings", "noteLinks", "timerCompletions"].includes(name)).map(async (name) => ({ name, count: await kokuDb.table(name).count() }))), []);
  const snapshots = useLiveQuery(() => kokuDb.recoverySnapshots.orderBy("createdAt").reverse().toArray(), []);
  const drafts = useLiveQuery(() => kokuDb.noteDrafts.orderBy("updatedAt").reverse().toArray(), []);
  const metadata = useLiveQuery(() => kokuDb.storageMeta.toArray(), []);
  const paused = metadata?.find((row) => row.key === "syncPaused")?.value;
  const lastBackup = metadata?.find((row) => row.key === "lastBackupAt")?.value;
  const recovered = metadata?.find((row) => row.key === "recoveredTimerState")?.value as { state: unknown; capturedAt: string } | undefined;

  // Bumping the counter re-runs the read; the effect owns every write to
  // `storage`, so nothing sets state straight from an event handler's await.
  const [storageCheck, setStorageCheck] = useState(0);
  const inspectStorage = () => setStorageCheck((count) => count + 1);
  useEffect(() => {
    let active = true;
    readStorageStatus().then(
      (next) => { if (active) setStorage(next); },
      () => undefined,
    );
    return () => { active = false; };
  }, [storageCheck]);

  async function exportData() {
    setBusy(true);
    try {
      await flushNoteSaves();
      const backup = await createBackup(includeKeys);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `koku-backup-${backup.exportedAt.slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await kokuDb.storageMeta.put({ key: "lastBackupAt", value: backup.exportedAt });
      toast.success("Backup download started. Keep the file outside this browser.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Backup failed. Retry."); }
    finally { setBusy(false); }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { setPreview(parseBackup(JSON.parse(await file.text()))); }
    catch { toast.error("Invalid or unsupported backup. Your data has not changed."); }
  }

  async function restore() {
    if (!preview) return;
    setBusy(true);
    try {
      await flushNoteSaves();
      await restoreBackup(preview);
      setPreview(null);
      toast.success("Backup restored. Cloud sync paused until you choose a sync direction.");
      inspectStorage();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Restore failed. Original data kept."); }
    finally { setBusy(false); }
  }

  async function recoverTimers() {
    if (!recovered) return;
    setBusy(true);
    try {
      await localTransaction([kokuDb.timeEntries, kokuDb.timerCompletions, kokuDb.storageMeta], async () => {
        for (const timer of migrateTimers(recovered.state)) {
          const entryId = `timer:${timer.id}`;
          if (!await kokuDb.timeEntries.get(entryId) && !await kokuDb.timerCompletions.get(timer.id)) {
            await createTimeEntry({ ...buildEntryFromTimer(timer, recovered.capturedAt), id: entryId });
            await kokuDb.timerCompletions.put({ id: timer.id, entryId, completedAt: recovered.capturedAt });
          }
        }
        await kokuDb.storageMeta.delete("recoveredTimerState");
      });
      toast.success("Recovered timer work in Time Log, ending at backup time.");
    } catch { toast.error("Timer recovery failed. Backup state kept for retry."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Settings / Storage" title="Your work, protected" description="Back up your workspace, recover drafts, and control cloud sync." />
    <Card><CardContent className="flex flex-wrap items-center gap-4 pt-5">
      <HardDrive className="size-6 text-primary" /><div className="min-w-0 flex-1 basis-48"><p className="font-medium">{storage?.persisted ? "Persistent browser storage enabled" : "Stored in this browser"}</p><p className="text-sm text-muted-foreground">{storage ? `${(storage.usage / 1048576).toFixed(1)} MB used · ${(storage.quota / 1073741824).toFixed(1)} GB available quota` : "Checking storage…"}</p></div>
      <Button variant="outline" disabled={storage?.persisted} onClick={async () => { try { const granted = await navigator.storage?.persist(); inspectStorage(); if (!granted) toast.info("Browser did not grant persistence. Keep an external backup."); } catch { toast.error("Storage persistence unavailable in this browser."); } }}><ShieldCheck />{storage?.persisted ? "Persistence enabled" : "Protect browser storage"}</Button>
    </CardContent></Card>
    {paused ? <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">Cloud sync paused after restore. Use manual sync to review differences and choose which copy to keep. <ManualSync /></div> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Download a backup</CardTitle><CardDescription>Includes personal notes, reminders, drafts, tasks, recorded work, and timer recovery state.</CardDescription></CardHeader><CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeKeys} onChange={(event) => setIncludeKeys(event.target.checked)} /> Include AI keys and connection credentials</label>
        {includeKeys && <p className="text-sm text-destructive">This file will contain unencrypted credentials. Store it privately.</p>}
        <Button disabled={busy} onClick={exportData}><Download />Download backup</Button><p className="text-xs text-muted-foreground">{typeof lastBackup === "string" ? `Last download requested: ${new Date(lastBackup).toLocaleString()}` : "No backup downloaded yet."}</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Restore a backup</CardTitle><CardDescription>Review a file before replacing data. A recovery copy is saved first.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Older backups preserve collections they do not contain. Active timers on this device stay running.</p><Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload />Choose backup file</Button><input aria-label="Backup file" ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={readFile} /></CardContent></Card>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{counts?.map(({ name, count }) => <div key={name} className="rounded-xl border bg-card p-4"><p className="text-xl font-semibold tabular-nums">{count}</p><p className="text-xs text-muted-foreground">{name.replace(/([A-Z])/g, " $1").toLowerCase()}</p></div>)}</div>
    {recovered && <Card><CardHeader><CardTitle>Timer work from your backup</CardTitle><CardDescription>Recover recorded time up to {new Date(recovered.capturedAt).toLocaleString()}. Existing sessions are not duplicated.</CardDescription></CardHeader><CardContent><Button disabled={busy} onClick={recoverTimers}>Recover timer work to Time Log</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>Recovery copies</CardTitle><CardDescription>Last three replacements kept here. These copies share browser storage; clearing site data removes them too.</CardDescription></CardHeader><CardContent className="space-y-3">{snapshots?.length ? snapshots.map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><p className="text-sm font-medium">{snapshot.reason}</p><p className="text-xs text-muted-foreground">{new Date(snapshot.createdAt).toLocaleString()}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => { try { setPreview(parseBackup({ version: 3, exportedAt: snapshot.createdAt, data: snapshot.data })); } catch { toast.error("Unable to validate this recovery copy."); } }}><ArchiveRestore />Review restore</Button></div>) : <p className="text-sm text-muted-foreground">Recovery copies appear before your first restore or cloud replacement.</p>}</CardContent></Card>
    {!!drafts?.length && <Card><CardHeader><CardTitle>Unfinished note drafts</CardTitle><CardDescription>Open a note to retry saving or keep your recovered draft as a copy.</CardDescription></CardHeader><CardContent className="space-y-2">{drafts.map((draft) => <Link className="block rounded-lg border p-3 text-sm hover:bg-muted" key={draft.id} href={`/notes?id=${draft.noteId}${draft.scope === "personal" ? "&tab=personal" : ""}`}>{draft.payload.title || "Untitled note"} · {draft.scope}</Link>)}</CardContent></Card>}
    <p className="text-sm text-muted-foreground">Browser storage cannot survive cleared site data or a lost device. Keep a downloaded backup elsewhere or sync successfully with your existing cloud account.</p>
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open && !busy) setPreview(null); }}><DialogContent><DialogHeader><DialogTitle>Restore this backup?</DialogTitle><DialogDescription>Replaces only the collections listed below. A recovery copy is created first; failed writes leave your current data intact.</DialogDescription></DialogHeader><div className="max-h-64 overflow-y-auto space-y-2">{preview && Object.entries(preview.data).map(([table, rows]) => <div className="flex justify-between text-sm" key={table}><span>{table}</span><span>{rows?.length ?? 0} records</span></div>)}</div><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button><Button disabled={busy} onClick={restore}>{busy ? "Restoring…" : "Restore backup"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
