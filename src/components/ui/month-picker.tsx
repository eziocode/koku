"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthPickerProps {
  /** Controlled value as "yyyy-MM" string. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);

  const [year, setYear] = React.useState<number>(() => {
    if (value) return parseInt(value.slice(0, 4), 10);
    return new Date().getFullYear();
  });

  const selectedYear = value ? parseInt(value.slice(0, 4), 10) : null;
  const selectedMonth = value ? parseInt(value.slice(5, 7), 10) - 1 : null;

  const displayLabel = React.useMemo(() => {
    if (!value) return null;
    const d = new Date(parseInt(value.slice(0, 4)), parseInt(value.slice(5, 7)) - 1, 1);
    return format(d, "MMM yyyy");
  }, [value]);

  function handleSelect(monthIndex: number) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    onChange(`${year}-${mm}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start gap-2 text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 opacity-60" />
          {displayLabel ?? "Pick a month"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-4" align="start">
        {/* Year navigation */}
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{year}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((name, idx) => {
            const isSelected = selectedYear === year && selectedMonth === idx;
            const isCurrentMonth =
              new Date().getFullYear() === year && new Date().getMonth() === idx;
            return (
              <Button
                key={name}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-9 text-sm",
                  isCurrentMonth && !isSelected && "border border-primary/30 text-primary",
                )}
                onClick={() => handleSelect(idx)}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
