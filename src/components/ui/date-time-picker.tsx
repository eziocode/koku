"use client";

import * as React from "react";
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

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  required,
  id,
  timeFormat = "24h",
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Split into date part and time part
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";

  const selected = React.useMemo(() => {
    if (!datePart) return undefined;
    const d = parse(datePart, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [datePart]);

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
    // Keep popover open to pick time
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "justify-start gap-2 text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {displayLabel ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleDaySelect}
          initialFocus
          defaultMonth={selected}
        />
        <div className="border-t border-border px-4 py-3">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Time</Label>
          {timeFormat === "12h" ? (
            <div className="flex items-center gap-2">
              <Select value={parts12h.hour12} onValueChange={(v) => handle12hChange({ hour12: v })}>
                <SelectTrigger className="w-[4.5rem]" aria-label="Hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select value={parts12h.minute} onValueChange={(v) => handle12hChange({ minute: v })}>
                <SelectTrigger className="w-[4.5rem]" aria-label="Minute">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {MINUTE_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={parts12h.period} onValueChange={(v) => handle12hChange({ period: v as "AM" | "PM" })}>
                <SelectTrigger className="w-[4.5rem]" aria-label="AM or PM">
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
              className="w-full"
              required={required}
            />
          )}
        </div>
        <div className="px-4 pb-3">
          <Button size="sm" className="w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
