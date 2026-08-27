"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  /** Controlled value as "yyyy-MM-ddTHH:mm" local datetime string (or empty). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
  /** Display/edit as 12h (AM/PM) or 24h. The stored value stays 24h "HH:mm" either way. */
  timeFormat?: TimeFormat;
  /**
   * Earliest selectable "yyyy-MM-ddTHH:mm". Days before its date are disabled in
   * the calendar, so an end time can never be dragged behind its start date.
   */
  min?: string;
}

/** Splits a 24h "HH:mm" into 12h parts, defaulting to a sane noon-ish start. */
function to12h(timePart: string) {
  const [hStr, mStr] = timePart.split(":");
  const h24 = Number(hStr);
  const hour12 = ((h24 % 12) || 12).toString();
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  return { hour12, minute: mStr ?? "00", period };
}

function from12h(hour12: string, minute: string, period: "AM" | "PM") {
  let h = Number(hour12) % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Below this height an anchored popover cannot hold a month grid *and* the time
 * row on either side of its trigger, so the picker switches to a centered panel.
 */
const COMPACT_QUERY = "(max-height: 700px)";

function useCompactViewport() {
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return compact;
}

/** Parse the date half of a local datetime string into a Date at local midnight. */
function toLocalDay(datetime: string | undefined) {
  if (!datetime) return undefined;
  const d = parse(datetime.slice(0, 10), "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  required,
  id,
  timeFormat = "24h",
  min,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const compact = useCompactViewport();

  // Split into date part and time part
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";

  const selected = React.useMemo(() => toLocalDay(value), [value]);
  const minDay = React.useMemo(() => toLocalDay(min), [min]);

  const displayLabel = React.useMemo(() => {
    if (!selected) return null;
    if (!timePart) return format(selected, "d MMM yyyy");
    const [h, m] = timePart.split(":").map(Number);
    const timeLabel = formatTime(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, m), timeFormat);
    return `${format(selected, "d MMM yyyy")} · ${timeLabel}`;
  }, [selected, timePart, timeFormat]);

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      onChange("");
      return;
    }
    const dateStr = format(day, "yyyy-MM-dd");
    onChange(timePart ? `${dateStr}T${timePart}` : `${dateStr}T00:00`);
    // Keep the panel open to pick time
  }

  function handleTimeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newTime = event.target.value;
    if (datePart) {
      onChange(`${datePart}T${newTime}`);
    }
  }

  const parts12h = React.useMemo(() => to12h(timePart || "00:00"), [timePart]);

  function handle12hChange(next: Partial<{ hour12: string; minute: string; period: "AM" | "PM" }>) {
    if (!datePart) return;
    const merged = { ...parts12h, ...next };
    const newTime = from12h(merged.hour12, merged.minute, merged.period);
    onChange(`${datePart}T${newTime}`);
  }

  function renderTrigger(onClick?: () => void) {
    return (
      <Button
        id={id}
        type="button"
        variant="outline"
        onClick={onClick}
        className={cn(
          "justify-start gap-2 text-left font-normal",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
        <span className="truncate">{displayLabel ?? placeholder}</span>
      </Button>
    );
  }

  /*
    Shared body for both presentations: the month grid is the only scrolling
    region, and the time row plus Done sit in a `shrink-0` footer so they stay
    on screen however little vertical room the panel ends up with.
  */
  const panel = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          initialFocus
          defaultMonth={selected ?? minDay}
          startMonth={minDay}
          disabled={minDay ? { before: minDay } : undefined}
          // `relative` anchors the month nav chevrons, which are absolutely
          // positioned and would otherwise resolve against the whole overlay.
          className="relative p-2"
          classNames={{
            month: "space-y-2",
            month_caption: "relative flex h-7 items-center justify-center",
            caption_label: "text-sm font-medium",
            // The shared Calendar leaves the nav buttons free-floating, which
            // parks them beside the grid instead of the month label.
            nav: "absolute inset-x-1 top-1 z-10 flex items-center justify-between",
            button_previous: "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30",
            button_next: "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30",
            weekday: "text-muted-foreground w-8 rounded-md font-normal text-[0.7rem]",
            week: "mt-0.5 flex w-full",
            day: "relative h-7 w-8 p-0 text-center text-[0.8rem] focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
            day_button: "inline-flex h-7 w-8 items-center justify-center rounded-md p-0 font-normal hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100",
          }}
        />
      </div>
      <div className="shrink-0 space-y-2 border-t border-border bg-popover px-3 py-2.5">
        <Label className="block text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          Time
        </Label>
        {timeFormat === "12h" ? (
          <div className="flex items-center gap-1.5">
            <Select value={parts12h.hour12} onValueChange={(v) => handle12hChange({ hour12: v })}>
              <SelectTrigger className="h-8 flex-1 px-2 text-sm" aria-label="Hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-52">
                {HOUR_OPTIONS.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">:</span>
            <Select value={parts12h.minute} onValueChange={(v) => handle12hChange({ minute: v })}>
              <SelectTrigger className="h-8 flex-1 px-2 text-sm" aria-label="Minute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-52">
                {MINUTE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={parts12h.period} onValueChange={(v) => handle12hChange({ period: v as "AM" | "PM" })}>
              <SelectTrigger className="h-8 flex-1 px-2 text-sm" aria-label="AM or PM">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Input
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className="h-8 w-full text-sm"
            required={required}
          />
        )}
        <Button type="button" size="sm" className="h-8 w-full text-sm" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </>
  );

  if (compact) {
    return (
      <>
        {renderTrigger(() => setOpen(true))}
        {open ? <CompactPanel onClose={() => setOpen(false)}>{panel}</CompactPanel> : null}
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
      <PopoverContent
        className="flex max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1.5rem),26rem)] w-[min(17.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
        align="start"
        sideOffset={8}
        collisionPadding={12}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Viewport-centered panel used instead of the anchored popover on short screens.
 * It is portalled to `document.body` so the parent dialog's own scroll container
 * can never clip it, and sized off `dvh` so it always fits the visible viewport.
 */
function CompactPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stop the keypress before the surrounding dialog also treats it as a
        // close request, which would dismiss the whole entry form.
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick date and time"
        className="flex max-h-[calc(100dvh-2rem)] w-[min(17.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
