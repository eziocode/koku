"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { EOD_SNOOZE_MINUTES } from "@/lib/notifications/messages";
import { explainUnsupported } from "@/lib/notifications/permission";
import { timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { parseSetting } from "@/lib/settings/schema";
import { kokuDb } from "@/lib/storage/db";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { useLiveQuery } from "@/lib/storage/use-live-query";

const GRACE_PERIOD_OPTIONS = [5, 10, 15, 20, 30] as const;

/**
 * Asks, once and unavoidably, when the user's working day ends.
 *
 * Mandatory because the end-of-day guard is the one feature that acts on the
 * user's data without being asked again — it stops and saves running timers —
 * and doing that at a time koku merely guessed is worse than not doing it. The
 * stored preference defaults to "18:00", so without an explicit answer koku
 * cannot tell an accepted default from an unanswered question.
 *
 * "Mandatory" is scoped to the *time*: auto-stop itself is a switch the user can
 * decline, and it is forced off where notifications can't be delivered, since
 * the wrap-up prompt is what makes the grace period meaningful.
 *
 * No X, no Esc, no overlay dismissal — see `hideClose` in ui/dialog. It gates
 * `CheckInIntro` too, so a new user answers this before being offered check-ins
 * rather than meeting two dialogs at once.
 */
export function EndOfDaySetup() {
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission, request } = useNotificationPermission();
  const { patchValue: patchOnboarding } = useTypedSetting("onboarding");

  /**
   * Read the row directly rather than through `useTypedSetting`: that hook
   * cannot tell "no row yet" from "row still loading", and both parse to the
   * default of `null`, which would flash this blocking dialog at every
   * returning user for as long as Dexie takes to answer.
   */
  const row = useLiveQuery(() => kokuDb.settings.get("onboarding"), []);
  const loaded = row !== undefined;
  const onboarding = parseSetting("onboarding", row?.value);

  const [logoffTime, setLogoffTime] = useState(prefs.endOfDay.logoffTime);
  const [graceMinutes, setGraceMinutes] = useState(prefs.endOfDay.gracePeriodMinutes);
  const [autoStop, setAutoStop] = useState(true);
  const [busy, setBusy] = useState(false);

  const unsupportedReason = explainUnsupported(support);
  const canAutoStop = support.supported;
  const timeValid = timeInputToMinutes(logoffTime) !== null;
  const open = loaded && onboarding.endOfDaySetAt === null;

  async function save() {
    if (!timeValid) {
      toast.error("Pick a logoff time first.");
      return;
    }

    setBusy(true);
    try {
      let enabled = autoStop && canAutoStop;

      if (enabled && permission !== "granted") {
        // Requested from this click on purpose: Safari enforces the user-gesture
        // rule, and Chrome permanently blocks an origin after repeated dismissals.
        const next = await request();
        if (next !== "granted") {
          enabled = false;
          toast.error(
            "Your browser blocked notifications, so auto-stop is off. Your logoff time is saved. Turn auto-stop on from Settings once notifications are allowed.",
          );
        }
      }

      await patch({
        endOfDay: { enabled, logoffTime, gracePeriodMinutes: graceMinutes },
      });

      if (enabled) {
        toast.success(`Day ends at ${logoffTime}, timers auto-stop ${graceMinutes} min later.`);
      }
    } finally {
      // Recorded last and unconditionally: a failed permission request is still
      // a completed answer, and re-blocking the app on it would trap the user.
      await patchOnboarding({ endOfDaySetAt: new Date().toISOString() });
      setBusy(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>When does your day end?</DialogTitle>
          <DialogDescription>
            koku needs one thing before it starts: your logoff time. It uses it to ask whether
            you&apos;re done, and to stop timers you forgot about instead of logging your evening as
            work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-logoff-time">Logoff time</Label>
            <Input
              id="setup-logoff-time"
              type="time"
              className="min-h-11 w-36"
              value={logoffTime}
              onChange={(event) => setLogoffTime(event.target.value)}
              autoFocus
            />
            {timeValid ? null : (
              <p className="text-xs text-destructive">Enter a valid time.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4">
            <div className="min-w-0">
              <Label htmlFor="setup-auto-stop" className="font-medium">
                Auto-stop running timers
              </Label>
              <p className="text-sm text-muted-foreground">
                {canAutoStop
                  ? `koku asks first: End day, +${EOD_SNOOZE_MINUTES} min, or Skip today, and only stops and saves if there's no answer.`
                  : unsupportedReason}
              </p>
            </div>
            <Switch
              id="setup-auto-stop"
              checked={autoStop && canAutoStop}
              disabled={!canAutoStop}
              onCheckedChange={setAutoStop}
            />
          </div>

          <div className={autoStop && canAutoStop ? "space-y-2" : "space-y-2 opacity-50"}>
            <Label htmlFor="setup-grace-period">Wait before stopping</Label>
            <Select
              value={String(graceMinutes)}
              disabled={!autoStop || !canAutoStop}
              onValueChange={(value) => setGraceMinutes(Number(value))}
            >
              <SelectTrigger id="setup-grace-period" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRACE_PERIOD_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Changeable any time in Settings → Notifications. Auto-stop only works while koku is open
          in a tab. It has no server to run this from.
        </p>

        <DialogFooter>
          <Button disabled={busy || !timeValid} onClick={() => void save()}>
            Save and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
