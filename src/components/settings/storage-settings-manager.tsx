"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

interface StorageSettingsManagerProps {
  initialValue?: {
    provider?: string;
    schedule?: string;
  };
}

export function StorageSettingsManager({ initialValue }: StorageSettingsManagerProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initialValue?.schedule || "weekly");

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/settings/storage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule }),
    });

    if (!response.ok) {
      toast.error("Unable to save storage settings.");
      return;
    }

    toast.success("Storage settings saved.");
    router.refresh();
  }

  async function handleBackup() {
    toast.info("Starting backup…");
    const response = await fetch("/api/backup", { method: "POST" });

    if (!response.ok) {
      toast.error("Unable to trigger backup.");
      return;
    }

    toast.success("Backup completed and uploaded to Catalyst File Store.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <form className="space-y-4" onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Storage provider</CardTitle>
            <CardDescription>
              Backups are encrypted and stored in your Catalyst File Store folder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Zoho Catalyst File Store</span>
              {" — "}managed storage, no credentials required.
            </div>
            <div className="space-y-2">
              <Label>Backup schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">Save settings</Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
          <CardDescription>Export all workspace data as an encrypted archive.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Koku packages your notes, projects, time logs, AI keys metadata, and mood history
            into an AES-256 encrypted zip archive and uploads it to your Catalyst File Store.
          </p>
          <Button onClick={handleBackup}>Trigger manual backup</Button>
        </CardContent>
      </Card>
    </div>
  );
}
