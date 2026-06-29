"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

interface StorageSettingsManagerProps {
  initialValue?: {
    provider?: string;
    schedule?: string;
    credentials?: string;
  };
}

export function StorageSettingsManager({ initialValue }: StorageSettingsManagerProps) {
  const router = useRouter();
  const [provider, setProvider] = useState(initialValue?.provider || "s3");
  const [schedule, setSchedule] = useState(initialValue?.schedule || "weekly");
  const [credentials, setCredentials] = useState(initialValue?.credentials || "{}");

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/settings/storage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, schedule, credentials }),
    });

    if (!response.ok) {
      toast.error("Unable to save storage settings.");
      return;
    }

    toast.success("Storage settings saved.");
    router.refresh();
  }

  async function handleBackup() {
    const response = await fetch("/api/backup", { method: "POST" });

    if (!response.ok) {
      toast.error("Unable to trigger backup.");
      return;
    }

    toast.success("Backup job triggered.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <form className="space-y-4" onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Storage provider</CardTitle>
            <CardDescription>Choose where encrypted backup archives should land.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google-drive">Google Drive</SelectItem>
                  <SelectItem value="onedrive">OneDrive</SelectItem>
                  <SelectItem value="dropbox">Dropbox</SelectItem>
                  <SelectItem value="s3">S3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-credentials">Credentials JSON</Label>
              <Textarea id="storage-credentials" value={credentials} onChange={(event) => setCredentials(event.target.value)} className="min-h-52 font-mono text-xs" />
            </div>
            <Button type="submit">Save storage settings</Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
          <CardDescription>Export all workspace data as an encrypted archive.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Koku packages your notes, projects, time logs, AI keys metadata, and mood history into an encrypted zip archive stored under the selected provider namespace.</p>
          <Button onClick={handleBackup}>Trigger manual backup</Button>
        </CardContent>
      </Card>
    </div>
  );
}
