"use client";

import { BellOff, X } from "lucide-react";
import { useState } from "react";

import { format, parseISO } from "date-fns";

import { DndMenu } from "@/components/notifications/dnd-menu";
import { QuickActionsCard } from "@/components/settings/quick-actions-card";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { explainShowFailure, showKokuNotificationDetailed } from "@/lib/notifications/client";
import { formatDndRemaining, resolveDnd } from "@/lib/notifications/dnd";
import { EOD_SNOOZE_MINUTES } from "@/lib/notifications/messages";
import { buildTestNotification } from "@/lib/notifications/payload";
import { explainUnsupported } from "@/lib/notifications/permission";
import { minutesToTimeInput, timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import {
  INTERVAL_PRESETS,
  AUTO_HIDE_PRESETS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_HOLIDAY_DATES,
  clampIntervalMinutes,
  toggleHolidayDate,
} from "@/lib/notifications/settings";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { cn } from "@/lib/utils";

/* ─── Shared row ──────────────────────────────────────────────────────────── */

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, disabled, onCheckedChange }: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/* ─── Settings ────────────────────────────────────────────────────────────── */

export function NotificationSettings() {
  const { prefs, patch, reset } = useNotificationPreferences();
  const { support, permission, request } = useNotificationPermission();
  const [customInterval, setCustomInterval] = useState<string>("");
  const [holidayDraft, setHolidayDraft] = useState<string>("");
  const [presetsDraft, setPresetsDraft] = useState<string | null>(null);
  const tickNow = useSecondTick();

  const unsupportedReason = explainUnsupported(support);
  const granted = permission === "granted";
  const denied = permission === "denied";
  const master = prefs.enabled;
  /** Sub-options stay visible but inert until the master switch is on. */
  const off = !master;
  // Read the clock through the shared ticker rather than calling Date.now() in
  // render, which is impure and flagged by the React Compiler lint rules.
  const dndState = resolveDnd(prefs.dnd, tickNow);

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
            Check-ins only fire while koku is open in a tab or its installed window — it has no
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

      {/* ── Do not disturb ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Do not disturb</CardTitle>
          <CardDescription>
            Silences check-ins without changing anything else. While it’s on, a badge stays in the
            top bar so you can’t forget.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <DndMenu align="start">
            <Button variant="outline" className="min-h-11 gap-2">
              <BellOff className="h-4 w-4" aria-hidden="true" />
              {dndState.active ? "Change" : "Turn on"}
            </Button>
          </DndMenu>
          <p className="text-sm text-muted-foreground">
            {dndState.active
              ? `On · ${formatDndRemaining(dndState, tickNow)} remaining`
              : "Currently off."}
          </p>
        </CardContent>
      </Card>

      {/* ── Quiet hours ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Quiet hours</CardTitle>
          <CardDescription>
            A window that repeats daily. Check-ins during it are skipped, not queued up for later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="quiet-hours-enabled"
            label="Use quiet hours"
            description="Off by default, so it changes nothing until you want it."
            checked={prefs.quietHours.enabled}
            disabled={off}
            onCheckedChange={(checked) => void patch({ quietHours: { enabled: checked } })}
          />
          <div className={cn("flex flex-wrap gap-4", (off || !prefs.quietHours.enabled) && "opacity-50")}>
            <div className="space-y-2">
              <Label htmlFor="quiet-start">From</Label>
              <Input
                id="quiet-start"
                type="time"
                className="min-h-11 w-36"
                disabled={off || !prefs.quietHours.enabled}
                value={minutesToTimeInput(prefs.quietHours.startMinute)}
                onChange={(event) => {
                  const minutes = timeInputToMinutes(event.target.value);
                  if (minutes !== null) {
                    void patch({ quietHours: { startMinute: minutes } });
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">Until</Label>
              <Input
                id="quiet-end"
                type="time"
                className="min-h-11 w-36"
                disabled={off || !prefs.quietHours.enabled}
                value={minutesToTimeInput(prefs.quietHours.endMinute)}
                onChange={(event) => {
                  const minutes = timeInputToMinutes(event.target.value);
                  if (minutes !== null) {
                    void patch({ quietHours: { endMinute: minutes } });
                  }
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A window that ends earlier than it starts spans midnight.
          </p>
        </CardContent>
      </Card>

      {/* ── Silent days ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Silent days</CardTitle>
          <CardDescription>
            Check-ins are skipped entirely on the selected days of the week.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("flex flex-wrap gap-2", off && "opacity-50")}>
            {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((label, dayIndex) => {
              const active = prefs.silentDays.includes(dayIndex);
              return (
                <button
                  key={dayIndex}
                  type="button"
                  disabled={off}
                  aria-pressed={active}
                  onClick={() => {
                    const next = active
                      ? prefs.silentDays.filter((d) => d !== dayIndex)
                      : [...prefs.silentDays, dayIndex].sort((a, b) => a - b);
                    void patch({ silentDays: next });
                  }}
                  className={cn(
                    "h-10 w-12 rounded-xl border text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                    off && "pointer-events-none",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {prefs.silentDays.length === 0
              ? "No days selected — notifications run every day."
              : `Silent on: ${prefs.silentDays
                  .map((d) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d])
                  .join(", ")}.`}
          </p>
        </CardContent>
      </Card>

      {/* ── Holidays ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>
            Mark a specific day off. Every notification for that day is skipped — check-ins and the
            end-of-day wrap-up — so a day off stays a day off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <DatePicker
              value={holidayDraft}
              onChange={setHolidayDraft}
              placeholder="Pick a day"
              className="min-h-11 w-52"
            />
            <Button
              variant="secondary"
              disabled={!holidayDraft}
              onClick={async () => {
                if (!holidayDraft) {
                  return;
                }

                if (prefs.holidayDates.includes(holidayDraft)) {
                  toast.error("That day is already marked as a holiday.");
                  return;
                }

                if (prefs.holidayDates.length >= MAX_HOLIDAY_DATES) {
                  toast.error(`You can keep up to ${MAX_HOLIDAY_DATES} holidays.`);
                  return;
                }

                await patch({ holidayDates: toggleHolidayDate(prefs.holidayDates, holidayDraft) });
                setHolidayDraft("");
                toast.success("Holiday added.");
              }}
            >
              Mark as holiday
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const todayKey = format(new Date(), "yyyy-MM-dd");
                const already = prefs.holidayDates.includes(todayKey);
                await patch({ holidayDates: toggleHolidayDate(prefs.holidayDates, todayKey) });
                toast.success(already ? "Today is a working day again." : "Today is a holiday.");
              }}
            >
              {prefs.holidayDates.includes(format(new Date(), "yyyy-MM-dd"))
                ? "Unmark today"
                : "Mark today"}
            </Button>
          </div>

          {prefs.holidayDates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No holidays yet — notifications run on every day that isn’t silent or quiet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {[...prefs.holidayDates].reverse().map((dateKey) => (
                <li key={dateKey}>
                  <button
                    type="button"
                    onClick={async () => {
                      await patch({ holidayDates: toggleHolidayDate(prefs.holidayDates, dateKey) });
                      toast.success("Holiday removed.");
                    }}
                    className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                    aria-label={`Remove holiday on ${dateKey}`}
                  >
                    {format(parseISO(`${dateKey}T00:00:00`), "EEE, d MMM yyyy")}
                    <X className="h-3.5 w-3.5 opacity-60" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Only today and past days can be picked, matching the rest of koku — a holiday silences
            the day it names, and past days simply record that the day was off.
          </p>
        </CardContent>
      </Card>

      {/* ── Breaks ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Breaks</CardTitle>
          <CardDescription>
            A break pauses your timers so the time isn’t logged as work, then logs itself as an
            entry tagged “break” — visible in your log, excluded from work totals.
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
        </CardContent>
      </Card>

      <QuickActionsCard />

      {/* ── End of day ───────────────────────────────────────────────────── */}
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

          <div className={cn("flex flex-wrap gap-4", (!prefs.endOfDay.enabled || !granted) && "opacity-50")}>
            <div className="space-y-2">
              <Label htmlFor="eod-logoff-time">Logoff time</Label>
              <Input
                id="eod-logoff-time"
                type="time"
                className="min-h-11 w-36"
                disabled={!prefs.endOfDay.enabled || !granted}
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
          </div>

          <p className="text-xs text-muted-foreground">
            The prompt carries {support.supportsActions ? "buttons" : "no buttons in this browser"} —
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

      {/* ── Test and reset ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Test and reset</CardTitle>
          <CardDescription>
            Send one to yourself to see exactly how it looks, and how many buttons your browser shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!granted}
            onClick={async () => {
              const result = await showKokuNotificationDetailed(
                buildTestNotification(prefs, { maxActions: support.maxActions }),
              );

              if (!result.shown) {
                toast.error(explainShowFailure(result) ?? "Couldn’t show the notification.");
                return;
              }

              // The browser accepted it. If nothing appears from here it is the
              // operating system suppressing it, which no web API can detect —
              // so say so rather than claim success outright.
              if (result.via === "constructor") {
                toast.success("Sent — without buttons, because the service worker wasn’t ready.");
              } else {
                toast.success("Sent. If nothing appeared, check your OS notification settings for your browser.");
              }
            }}
          >
            Send test notification
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await reset();
              toast.success("Notification settings reset.");
            }}
          >
            Reset to defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
