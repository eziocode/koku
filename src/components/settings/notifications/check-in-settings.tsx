"use client";

import { useState } from "react";

import { ToggleRow } from "@/components/settings/toggle-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  INTERVAL_PRESETS,
  AUTO_HIDE_PRESETS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  clampIntervalMinutes,
} from "@/lib/notifications/settings";
import { explainUnsupported } from "@/lib/notifications/permission";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { cn } from "@/lib/utils";

/**
 * Check-in reminders: the permission gate + master switch, cadence, and the
 * notification action buttons. Split out of the old `NotificationSettings`
 * monolith — see `src/app/(app)/settings/notifications/check-ins/page.tsx`.
 */
export function CheckInSettings() {
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission, request } = useNotificationPermission();
  const [customInterval, setCustomInterval] = useState<string>("");

  const unsupportedReason = explainUnsupported(support);
  const granted = permission === "granted";
  const denied = permission === "denied";
  const master = prefs.enabled;
  /** Sub-options stay visible but inert until the master switch is on. */
  const off = !master;

  const usingPreset = (INTERVAL_PRESETS as readonly number[]).includes(prefs.checkIn.intervalMinutes);

  async function saveCustomInterval() {
    const parsed = Number(customInterval);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      toast.error("Enter a whole number of minutes.");
      return;
    }

    const clamped = clampIntervalMinutes(parsed);
    if (clamped !== parsed) {
      toast.error(`Interval must be between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES} minutes.`);
      return;
    }

    await patch({ checkIn: { intervalMinutes: clamped } });
    setCustomInterval("");
    toast.success(`Check-ins every ${clamped} minutes.`);
  }

  return (
    <div className="space-y-6">
      {/* ── Permission and master switch ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Check-in reminders</CardTitle>
          <CardDescription>
            Koku can nudge you at an interval to ask whether the current work is worth recording.
            Check-in reminders start enabled at 30 minutes by default; turn them off any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unsupportedReason ? (
            <p className="rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              {unsupportedReason}
            </p>
          ) : denied ? (
            <p className="rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              Notifications are blocked for koku in your browser settings. You’ll need to allow them
              there before this can be switched on.
            </p>
          ) : !granted ? (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                Your browser needs to allow notifications first.
              </p>
              <Button
                onClick={async () => {
                  // Requested from a click on purpose: Safari requires a user
                  // gesture, and Chrome permanently blocks an origin after
                  // repeated dismissals.
                  const next = await request();
                  if (next === "granted") {
                    toast.success("Notifications allowed.");
                  } else if (next === "denied") {
                    toast.error("Notifications were blocked.");
                  }
                }}
              >
                Enable notifications
              </Button>
            </div>
          ) : (
            <ToggleRow
              id="notifications-enabled"
              label="Check-in reminders"
              description="The master switch. With this off, koku schedules nothing at all."
              checked={master}
              onCheckedChange={(checked) => void patch({ enabled: checked })}
            />
          )}

          <p className="text-sm text-muted-foreground">
            Check-ins only fire while koku is open in a tab or its installed window, it has no
            server to send them from when everything is closed.
            {support.supported && !support.supportsActions
              ? " This browser doesn’t show buttons on notifications, so clicking the notification itself opens your log."
              : null}
          </p>
        </CardContent>
      </Card>

      {/* ── Cadence ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>How often</CardTitle>
          <CardDescription>
            Backgrounded tabs are throttled by the browser to roughly one wake a minute, so anything
            under {MIN_INTERVAL_MINUTES} minutes couldn’t be delivered honestly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="checkin-enabled"
            label="Send check-ins"
            description="Turn off to keep breaks and do-not-disturb without the recurring nudge."
            checked={prefs.checkIn.enabled}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { enabled: checked } })}
          />

          <div className={cn("space-y-2", off && "opacity-50")}>
            <Label htmlFor="checkin-interval">Interval</Label>
            <Select
              value={usingPreset ? String(prefs.checkIn.intervalMinutes) : "custom"}
              onValueChange={(value) => {
                if (value !== "custom") {
                  void patch({ checkIn: { intervalMinutes: Number(value) } });
                }
              }}
              disabled={off}
            >
              <SelectTrigger id="checkin-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_PRESETS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    Every {minutes} minutes
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                id="checkin-custom"
                type="number"
                min={MIN_INTERVAL_MINUTES}
                max={MAX_INTERVAL_MINUTES}
                value={customInterval}
                disabled={off}
                onChange={(event) => setCustomInterval(event.target.value)}
                placeholder={usingPreset ? "Custom minutes" : String(prefs.checkIn.intervalMinutes)}
                className="min-h-11"
              />
              <Button variant="outline" disabled={off || !customInterval} onClick={() => void saveCustomInterval()}>
                Set
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Currently every {prefs.checkIn.intervalMinutes} minutes.
            </p>
          </div>

          <ToggleRow
            id="checkin-require-interaction"
            label="Keep in the notification centre"
            description="Overrides auto-hide and stays until you act on it. Chrome and Edge on desktop only."
            checked={prefs.checkIn.requireInteraction}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { requireInteraction: checked } })}
          />

          <div className={cn("space-y-2", (off || prefs.checkIn.requireInteraction) && "opacity-50")}>
            <Label htmlFor="checkin-auto-hide">Auto-hide after</Label>
            <Select
              value={String(prefs.checkIn.autoHideMinutes)}
              disabled={off || prefs.checkIn.requireInteraction}
              onValueChange={(value) => void patch({ checkIn: { autoHideMinutes: Number(value) } })}
            >
              <SelectTrigger id="checkin-auto-hide" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_HIDE_PRESETS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} {minutes === 1 ? "minute" : "minutes"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default: 1 minute. Browser may dismiss sooner or later depending on OS settings.
            </p>
          </div>

          <ToggleRow
            id="checkin-idle"
            label="Remind me when nothing is tracked"
            description="Nudges you to start a timer when none is running."
            checked={prefs.checkIn.notifyWhenIdle}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { notifyWhenIdle: checked } })}
          />
        </CardContent>
      </Card>

      {/* ── Notification actions ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons on the notification</CardTitle>
          <CardDescription>
            {support.supportsActions
              ? `This browser shows up to ${support.maxActions}, in the order below.`
              : "This browser doesn’t render notification buttons, so these have no effect here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="action-quick-note"
            label="Quick note"
            description="Opens a single-field composer that appends a timestamped note to what’s running."
            checked={prefs.checkIn.actions.quickNote}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { actions: { quickNote: checked } } })}
          />
          <ToggleRow
            id="action-open-log"
            label="Open log"
            description="Jumps to your time log."
            checked={prefs.checkIn.actions.openLog}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { actions: { openLog: checked } } })}
          />
          <ToggleRow
            id="action-dismiss"
            label="Dismiss"
            description="An explicit way to clear the check-in."
            checked={prefs.checkIn.actions.dismiss}
            disabled={off}
            onCheckedChange={(checked) => void patch({ checkIn: { actions: { dismiss: checked } } })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
