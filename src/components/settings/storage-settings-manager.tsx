"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { kokuDb, type AiKey, type AppSetting, type Category, type Note, type NoteLink, type Project, type TimeEntry } from "@/lib/storage/db";
import { syncWithConflictPrompt } from "@/lib/sync/sync-engine";

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

interface BackupPayload {
  version: number;
  exportedAt: string;
  data: {
    projects: Project[];
    categories: Category[];
    timeEntries: TimeEntry[];
    notes: Note[];
    noteLinks: NoteLink[];
    aiKeys: AiKey[];
    settings: AppSetting[];
  };
}

/**
 * Recursively strip any link `href` attributes that are not http(s) URLs from
 * a TipTap ProseMirror JSON node tree. This prevents javascript: / data: URIs
 * embedded in imported backup files from being executed when a user clicks a
 * link node in the editor.
 */
function sanitizeTipTapContent(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as Record<string, unknown>;

  // Strip unsafe hrefs from link marks
  if (n.type === "link" && n.attrs && typeof n.attrs === "object") {
    const attrs = n.attrs as Record<string, unknown>;
    const href = attrs.href;
    if (typeof href === "string" && !/^https?:\/\//i.test(href)) {
      attrs.href = "";
    }
  }

  if (Array.isArray(n.marks)) {
    n.marks = n.marks.map((mark: unknown) => {
      const m = mark as Record<string, unknown>;
      if (m.type === "link" && m.attrs && typeof m.attrs === "object") {
        const attrs = m.attrs as Record<string, unknown>;
        const href = attrs.href;
        if (typeof href === "string" && !/^https?:\/\//i.test(href)) {
          attrs.href = "";
        }
      }
      return m;
    });
  }

  if (Array.isArray(n.content)) {
    n.content = n.content.map(sanitizeTipTapContent);
  }

  return n;
}

interface StorageCounts {
  projects: number;
  categories: number;
  timeEntries: number;
  notes: number;
  noteLinks: number;
  aiKeys: number;
}

export function StorageSettingsManager() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [counts, setCounts] = useState<StorageCounts | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function loadCounts() {
      const [projects, categories, timeEntries, notes, noteLinks, aiKeys] = await Promise.all([
        kokuDb.projects.count(),
        kokuDb.categories.count(),
        kokuDb.timeEntries.count(),
        kokuDb.notes.count(),
        kokuDb.noteLinks.count(),
        kokuDb.aiKeys.count(),
      ]);
      setCounts({ projects, categories, timeEntries, notes, noteLinks, aiKeys });
    }
    loadCounts();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncWithConflictPrompt();
      if (result.error) {
        toast.error(result.error === "Not signed in"
          ? "Sign in with Zoho first to sync."
          : result.error);
      } else {
        toast.success(`Sync complete — pushed ${result.pushed}, pulled ${result.pulled} rows.`);
      }
    } catch {
      toast.error("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        projects: await kokuDb.projects.toArray(),
        categories: await kokuDb.categories.toArray(),
        timeEntries: await kokuDb.timeEntries.toArray(),
        notes: await kokuDb.notes.toArray(),
        noteLinks: await kokuDb.noteLinks.toArray(),
        aiKeys: await kokuDb.aiKeys.toArray(),
        settings: await kokuDb.settings.toArray(),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "koku-export-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Local export downloaded.");
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "Importing will replace the current local data in this browser. Continue?",
    );

    if (!confirmed) {
      event.target.value = "";
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<BackupPayload>;
      const sourceData = parsed.data;

      if (!sourceData) {
        throw new Error("Invalid backup file.");
      }

      const data: BackupPayload["data"] = {
        projects: Array.isArray(sourceData.projects) ? sourceData.projects : [],
        categories: Array.isArray(sourceData.categories) ? sourceData.categories : [],
        timeEntries: Array.isArray(sourceData.timeEntries) ? sourceData.timeEntries : [],
        notes: Array.isArray(sourceData.notes)
          ? sourceData.notes.map((note) => ({
              ...note,
              content: sanitizeTipTapContent(note.content),
            }))
          : [],
        noteLinks: Array.isArray(sourceData.noteLinks) ? sourceData.noteLinks : [],
        aiKeys: Array.isArray(sourceData.aiKeys) ? sourceData.aiKeys : [],
        settings: Array.isArray(sourceData.settings) ? sourceData.settings : [],
      };

      await Promise.all([
        kokuDb.noteLinks.clear(),
        kokuDb.timeEntries.clear(),
        kokuDb.notes.clear(),
        kokuDb.projects.clear(),
        kokuDb.categories.clear(),
        kokuDb.aiKeys.clear(),
        kokuDb.settings.clear(),
      ]);

      await Promise.all([
        data.projects.length ? kokuDb.projects.bulkPut(data.projects) : Promise.resolve(),
        data.categories.length ? kokuDb.categories.bulkPut(data.categories) : Promise.resolve(),
        data.timeEntries.length ? kokuDb.timeEntries.bulkPut(data.timeEntries) : Promise.resolve(),
        data.notes.length ? kokuDb.notes.bulkPut(data.notes) : Promise.resolve(),
        data.noteLinks.length ? kokuDb.noteLinks.bulkPut(data.noteLinks) : Promise.resolve(),
        data.aiKeys.length ? kokuDb.aiKeys.bulkPut(data.aiKeys) : Promise.resolve(),
        data.settings.length ? kokuDb.settings.bulkPut(data.settings) : Promise.resolve(),
      ]);

      toast.success("Local data imported.");
    } catch {
      toast.error("Unable to import this file.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Storage</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Export, import, and sync</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your data lives entirely in this browser. Export a snapshot any time, import it on another
          device, or wait for cloud drive sync when it ships.
        </p>
      </div>

      {/* Local storage info */}
      <Card className="border-primary/15 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Where your data lives
            <Badge className="rounded-full text-xs">IndexedDB</Badge>
          </CardTitle>
          <CardDescription>
            All records are stored in your browser&apos;s IndexedDB under the origin{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              {typeof window !== "undefined" ? window.location.origin : "…"}
            </code>
            , database{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">koku-local</code>.
            Nothing is sent to any server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {counts ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ["Projects", counts.projects],
                  ["Categories", counts.categories],
                  ["Time entries", counts.timeEntries],
                  ["Notes", counts.notes],
                  ["Note links", counts.noteLinks],
                  ["AI keys", counts.aiKeys],
                ] as [string, number][]
              ).map(([label, count]) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-3 text-center">
                  <p className="text-2xl font-semibold text-foreground">{count}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading counts…</p>
          )}
        </CardContent>
      </Card>

      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Export all data</CardTitle>
            <CardDescription>Download every table as a single JSON file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Includes projects, categories, notes, note links, time entries, AI keys, and settings.
            </p>
            <Button onClick={handleExport}>Export all data</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import data</CardTitle>
            <CardDescription>Restore a previously exported JSON snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import replaces the current local database for this browser profile after confirmation.
            </p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Import data
            </Button>
          </CardContent>
        </Card>

        <Card className="opacity-70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Google Drive
              <Badge variant="secondary" className="rounded-full text-xs">Coming soon</Badge>
            </CardTitle>
            <CardDescription>Automatic backups to your Google Drive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OAuth-based sync will let you keep an automatic off-device copy without sharing your data with any service.
            </p>
            <Button variant="secondary" disabled>Connect Google Drive</Button>
          </CardContent>
        </Card>

        {isLocalMode ? (
          <Card className="opacity-70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Catalyst Sync
                <Badge variant="secondary" className="rounded-full text-xs">Cloud only</Badge>
              </CardTitle>
              <CardDescription>Sync data across devices via Zoho Catalyst.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enable cloud mode (set <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">LOCAL_MODE=false</code>) and sign in with Zoho to enable cross-device sync.
              </p>
              <Button variant="secondary" disabled>Sync now</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Catalyst Sync</CardTitle>
              <CardDescription>Sync your data across devices via Zoho Catalyst.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pushes all local records to Catalyst and pulls any remote changes. Requires a Zoho sign-in.
              </p>
              <Button onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
