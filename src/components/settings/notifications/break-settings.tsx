"use client";

import Link from "next/link";
import { useState } from "react";

import { ToggleRow } from "@/components/settings/toggle-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { cn } from "@/lib/utils";

/**
 * Breaks card, split out of the old `NotificationSettings` monolith. Gated on
 * `breaks.enabled` only — deliberately *not* on the check-in master switch,
 * matching the original component's behaviour.
 */
export function BreakSettings() {
  const { prefs, patch } = useNotificationPreferences();
  const [presetsDraft, setPresetsDraft] = useState<string | null>(null);

  async function savePresets() {
    if (presetsDraft === null) {
      return;
    }

    const parsed = presetsDraft
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 240);

    if (parsed.length === 0) {
      toast.error("Enter at least one break length between 1 and 240 minutes.");
      return;
    }

    const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
    await patch({ breaks: { presetMinutes: unique } });
    setPresetsDraft(null);
    toast.success("Break presets updated.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Breaks</CardTitle>
          <CardDescription>
            A break pauses your timers so the time isn’t logged as work, then logs itself as an
            entry tagged “break”, visible in your log, excluded from work totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="breaks-enabled"
            label="Show the break button"
            description="Turn off to hide breaks entirely."
            checked={prefs.breaks.enabled}
            onCheckedChange={(checked) => void patch({ breaks: { enabled: checked } })}
          />

          <div className={cn("space-y-2", !prefs.breaks.enabled && "opacity-50")}>
            <Label htmlFor="break-presets">Preset lengths (minutes)</Label>
            <div className="flex gap-2">
              <Input
                id="break-presets"
                className="min-h-11"
                disabled={!prefs.breaks.enabled}
                value={presetsDraft ?? prefs.breaks.presetMinutes.join(", ")}
                onChange={(event) => setPresetsDraft(event.target.value)}
                placeholder="5, 10, 15, 30"
              />
              <Button
                variant="outline"
                disabled={!prefs.breaks.enabled || presetsDraft === null}
                onClick={() => void savePresets()}
              >
                Save
              </Button>
            </div>
          </div>

          <ToggleRow
            id="breaks-auto-resume"
            label="Resume timers afterwards"
            description="Picks your paused timers back up when the break ends."
            checked={prefs.breaks.autoResume}
            disabled={!prefs.breaks.enabled}
            onCheckedChange={(checked) => void patch({ breaks: { autoResume: checked } })}
          />
          <ToggleRow
            id="breaks-notify"
            label="Notify me when a break ends"
            description="Needs check-in reminders to be allowed above."
            checked={prefs.breaks.notifyOnComplete}
            disabled={!prefs.breaks.enabled}
            onCheckedChange={(checked) => void patch({ breaks: { notifyOnComplete: checked } })}
          />
          <ToggleRow
            id="breaks-block"
            label="Block new timers during a break"
            description="Keeps a break honest. Turn off if you want to start tracking mid-break."
            checked={prefs.breaks.blockNewTimers}
            disabled={!prefs.breaks.enabled}
            onCheckedChange={(checked) => void patch({ breaks: { blockNewTimers: checked } })}
          />
          <p className="text-sm text-muted-foreground">
            Custom one-click buttons for calls, standups, and anything else you want tracked live in{" "}
            <Link href="/settings/quick-actions" className="font-medium text-primary hover:underline">
              Quick actions
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
