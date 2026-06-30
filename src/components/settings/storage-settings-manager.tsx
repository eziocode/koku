"use client";

import { ChangeEvent, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { kokuDb, type AiKey, type AppSetting, type Category, type Note, type NoteLink, type Project, type TimeEntry } from "@/lib/storage/db";

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

export function StorageSettingsManager() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        notes: Array.isArray(sourceData.notes) ? sourceData.notes : [],
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

  function handleGoogleDriveConnect() {
    window.open("https://accounts.google.com/o/oauth2/v2/auth", "_blank", "noopener,noreferrer");
    toast.info("Google Drive sync is coming soon.");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Storage</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Export, import, and sync</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your data lives locally by default. Export a snapshot, import a backup, or prepare for future cloud drive sync.
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Export all data</CardTitle>
            <CardDescription>Download every Dexie table as a single JSON file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Includes projects, categories, notes, note links, time entries, AI keys, and app settings.
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

        <Card>
          <CardHeader>
            <CardTitle>Connect Google Drive</CardTitle>
            <CardDescription>Placeholder for optional future cloud sync.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OAuth flow opens in a new tab for now. Actual sync support is coming soon.
            </p>
            <Button variant="secondary" onClick={handleGoogleDriveConnect}>Connect Google Drive</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
