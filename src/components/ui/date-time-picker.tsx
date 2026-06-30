"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  /** Controlled value as "yyyy-MM-ddTHH:mm" local datetime string (or empty). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  required,
  id,
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
    return `${format(selected, "d MMM yyyy")}${timePart ? ` · ${timePart}` : ""}`;
  }, [selected, timePart]);

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
          <Input
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className="w-full"
            required={required}
          />
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
