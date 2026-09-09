"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MultiDatePickerProps {
  /** Currently committed dates, e.g. an existing holiday/leave list — used only to disable already-picked days. */
  existing?: readonly string[];
  /** Confirms the picked days ("Add selected"), as "yyyy-MM-dd" strings. */
  onAdd: (values: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Passed straight through to the underlying Calendar's `disabled` matcher, e.g. `{ after: new Date() }`. */
  disabledMatcher?: React.ComponentProps<typeof Calendar>["disabled"];
}

export function MultiDatePicker({
  existing = [],
  onAdd,
  addLabel = "Add selected",
  placeholder = "Pick days",
  className,
  disabled,
  disabledMatcher,
}: MultiDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Date[]>([]);

  function handleSelect(days: Date[] | undefined) {
    setPicked(days ?? []);
  }

  function handleAdd() {
    const values = picked
      .map((day) => format(day, "yyyy-MM-dd"))
      .filter((value) => !existing.includes(value));
    if (values.length) {
      onAdd(values);
    }
    setPicked([]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start gap-2 text-left font-normal",
            picked.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {picked.length > 0 ? `${picked.length} day${picked.length === 1 ? "" : "s"} selected` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="multiple" selected={picked} onSelect={handleSelect} disabled={disabledMatcher} initialFocus />
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <Button variant="ghost" size="sm" disabled={picked.length === 0} onClick={() => setPicked([])}>
            Clear
          </Button>
          <Button size="sm" disabled={picked.length === 0} onClick={handleAdd}>
            {addLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
