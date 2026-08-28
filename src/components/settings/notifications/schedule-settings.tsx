"use client";

import { BellOff, X } from "lucide-react";
import { useState } from "react";

import { format, parseISO } from "date-fns";

import { DndMenu } from "@/components/notifications/dnd-menu";
import { MasterStateNotice } from "@/components/settings/notifications/master-state-notice";
import { ToggleRow } from "@/components/settings/toggle-row";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { formatDndRemaining, resolveDnd } from "@/lib/notifications/dnd";
import {
  MAX_HOLIDAY_DATES,
  toggleHolidayDate,
} from "@/lib/notifications/settings";
import { minutesToTimeInput, timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Do not disturb, quiet hours, silent days, and holidays — everything that
 * decides *when* check-ins are allowed to fire. Split out of the old
 * `NotificationSettings` monolith; see
 * `src/app/(app)/settings/notifications/schedule/page.tsx`.
 */
export function ScheduleSettings() {
  const { prefs, patch } = useNotificationPreferences();
  const [holidayDraft, setHolidayDraft] = useState<string>("");
  const tickNow = useSecondTick();

  const master = prefs.enabled;
  const off = !master;
  // Read the clock through the shared ticker rather than calling Date.now() in
  // render, which is impure and flagged by the React Compiler lint rules.
  const dndState = resolveDnd(prefs.dnd, tickNow);

  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <MasterStateNotice
        show={off}
        message="Check-in reminders are off, so nothing below will take effect yet."
      />

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
          <p className="text-sm text-muted-foreground" aria-live="off">
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
          <fieldset
            disabled={off || !prefs.quietHours.enabled}
            className={cn("flex flex-wrap gap-4 border-0 p-0", (off || !prefs.quietHours.enabled) && "opacity-50")}
          >
            <legend className="sr-only">Quiet hours window</legend>
            <div className="space-y-2">
              <Label htmlFor="quiet-start">From</Label>
              <Input
                id="quiet-start"
                type="time"
                className="min-h-11 w-36"
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
                value={minutesToTimeInput(prefs.quietHours.endMinute)}
                onChange={(event) => {
                  const minutes = timeInputToMinutes(event.target.value);
                  if (minutes !== null) {
                    void patch({ quietHours: { endMinute: minutes } });
                  }
                }}
              />
            </div>
          </fieldset>
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
          <SilentDaysGroup
            selected={prefs.silentDays}
            disabled={off}
            onChange={(next) => void patch({ silentDays: next })}
          />
          <p className="text-xs text-muted-foreground">
            {prefs.silentDays.length === 0
              ? "No days selected, notifications run every day."
              : `Silent on: ${prefs.silentDays.map((d) => WEEKDAY_NAMES[d]).join(", ")}.`}
          </p>
        </CardContent>
      </Card>

      {/* ── Holidays ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>
            Mark a specific day off. Every notification for that day is skipped, check-ins and the
            end-of-day wrap-up alike, so a day off stays a day off.
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
                const already = prefs.holidayDates.includes(todayKey);
                await patch({ holidayDates: toggleHolidayDate(prefs.holidayDates, todayKey) });
                toast.success(already ? "Today is a working day again." : "Today is a holiday.");
              }}
            >
              {prefs.holidayDates.includes(todayKey) ? "Unmark today" : "Mark today"}
            </Button>
          </div>

          {prefs.holidayDates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No holidays yet, notifications run on every day that isn’t silent or quiet.
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
            Only today and past days can be picked, matching the rest of koku: a holiday silences
            the day it names, and past days simply record that the day was off.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Roving-tabindex day picker: one tab stop for the group, arrow keys move
 * focus between days, Space/Enter toggles. Replaces seven separate tab stops
 * for a single "silent days" setting.
 */
function SilentDaysGroup({
  selected,
  disabled,
  onChange,
}: {
  selected: number[];
  disabled: boolean;
  onChange: (next: number[]) => void;
}) {
  const [focusIndex, setFocusIndex] = useState(0);

  function toggle(dayIndex: number) {
    const active = selected.includes(dayIndex);
    const next = active ? selected.filter((d) => d !== dayIndex) : [...selected, dayIndex].sort((a, b) => a - b);
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-label="Silent days of the week"
      className={cn("flex flex-wrap gap-2", disabled && "opacity-50")}
    >
      {WEEKDAY_LABELS.map((label, dayIndex) => {
        const active = selected.includes(dayIndex);
        return (
          <button
            key={dayIndex}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={WEEKDAY_NAMES[dayIndex]}
            tabIndex={dayIndex === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(dayIndex)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const nextIndex = (dayIndex + delta + WEEKDAY_LABELS.length) % WEEKDAY_LABELS.length;
                setFocusIndex(nextIndex);
                (event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined)?.focus();
              }
            }}
            onClick={() => toggle(dayIndex)}
            className={cn(
              "h-10 w-12 rounded-xl border text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
