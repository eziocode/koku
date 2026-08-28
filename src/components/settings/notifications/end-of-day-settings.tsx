"use client";

import { MasterStateNotice } from "@/components/settings/notifications/master-state-notice";
import { ToggleRow } from "@/components/settings/toggle-row";
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
import { EOD_SNOOZE_MINUTES } from "@/lib/notifications/messages";
import { minutesToTimeInput, timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { cn } from "@/lib/utils";

/**
 * End of day auto-stop, split out of the old `NotificationSettings`
 * monolith. Gated on browser notification permission only — deliberately
 * *not* on the check-in master switch, matching the original component.
 */
export function EndOfDaySettings() {
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission } = useNotificationPermission();
  const granted = permission === "granted";

  return (
    <div className="space-y-6">
      <MasterStateNotice
        show={!granted}
        message="Browser notifications aren’t allowed yet, so auto-stop can’t run."
        linkLabel="Allow notifications"
      />

      <Card>
        <CardHeader>
          <CardTitle>End of day</CardTitle>
          <CardDescription>
            At your logoff time, koku asks if you’re done. If there’s no response within the grace
            period, running timers are stopped and saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="eod-enabled"
            label="Auto-stop at end of day"
            description="Requires notifications to be allowed above."
            checked={prefs.endOfDay.enabled}
            disabled={!granted}
            onCheckedChange={(checked) => void patch({ endOfDay: { enabled: checked } })}
          />

          <fieldset
            disabled={!prefs.endOfDay.enabled || !granted}
            className={cn(
              "flex flex-wrap gap-4 border-0 p-0",
              (!prefs.endOfDay.enabled || !granted) && "opacity-50",
            )}
          >
            <legend className="sr-only">End-of-day timing</legend>
            <div className="space-y-2">
              <Label htmlFor="eod-logoff-time">Logoff time</Label>
              <Input
                id="eod-logoff-time"
                type="time"
                className="min-h-11 w-36"
                value={minutesToTimeInput(timeInputToMinutes(prefs.endOfDay.logoffTime) ?? 18 * 60)}
                onChange={(event) => {
                  void patch({ endOfDay: { logoffTime: event.target.value } });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eod-grace-period">Grace period</Label>
              <Select
                value={String(prefs.endOfDay.gracePeriodMinutes)}
                disabled={!prefs.endOfDay.enabled || !granted}
                onValueChange={(value) =>
                  void patch({ endOfDay: { gracePeriodMinutes: Number(value) } })
                }
              >
                <SelectTrigger id="eod-grace-period" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 30].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <p className="text-xs text-muted-foreground">
            The prompt carries {support.supportsActions ? "buttons" : "no buttons in this browser"}:
            End day, +{EOD_SNOOZE_MINUTES} min, and Skip today
            {support.supportsActions
              ? `, of which this browser shows the first ${support.maxActions}`
              : ", so clicking the notification itself counts as Skip today"}
            . It stays in your notification centre until you answer, so you can answer it from any
            app, not just this tab.
          </p>
          <p className="text-xs text-muted-foreground">
            Requires koku to be open in a browser tab when your logoff time passes. Works
            independently of the check-in schedule above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
