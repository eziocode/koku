"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** react-day-picker v9 puts every modifier class on the day CELL (the <td>) and
 *  exposes data-selected / data-today / data-outside / data-disabled there — the
 *  button gets none of them. So all visual treatment lives on the button and is
 *  reached through the cell's attributes. The `:not([data-selected])` guards make
 *  "selected wins over today" a selector-level fact rather than a bet on which
 *  Tailwind utility happens to land later in the stylesheet.
 *
 *  Exported so other pickers can compose it at their own cell size; it carries no
 *  sizing of its own. Anything overriding `day_button` must include this or it
 *  silently loses today/selected styling. */
export const calendarDayButtonModifiers = [
  // Today, unselected: no fill, an inset ring, and a brand-coloured digit.
  "[[data-today]:not([data-selected])_&]:bg-transparent",
  "[[data-today]:not([data-selected])_&]:font-semibold",
  "[[data-today]:not([data-selected])_&]:text-primary-accessible",
  "[[data-today]:not([data-selected])_&]:ring-1",
  "[[data-today]:not([data-selected])_&]:ring-inset",
  "[[data-today]:not([data-selected])_&]:ring-primary-accessible",
  "[[data-today]:not([data-selected])_&]:hover:bg-primary-accessible/10",
  // Selected, today included: solid fill, never a ring.
  "[[data-selected]_&]:bg-primary",
  "[[data-selected]_&]:text-primary-foreground",
  "[[data-selected]_&]:ring-0",
  "[[data-selected]_&]:hover:bg-primary",
  "[[data-selected]_&]:hover:text-primary-foreground",
  // Outside the month: dimmed, and ringless so a neighbouring month's today
  // cannot shout louder than the month you are looking at.
  "[[data-outside]:not([data-selected])_&]:text-muted-foreground/60",
  "[[data-outside]_&]:font-normal",
  "[[data-outside]:not([data-selected])_&]:ring-0",
  // Disabled: dim and inert, ringless even when it is today.
  "[[data-disabled]:not([data-selected])_&]:text-muted-foreground",
  "[[data-disabled]_&]:opacity-40",
  "[[data-disabled]_&]:ring-0",
  "[[data-disabled]_&]:font-normal",
  "[[data-disabled]_&]:pointer-events-none",
].join(" ");

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  // `mode` lives on a discriminated union, so read it through a local narrowing
  // rather than widening the public prop type.
  const mode = (props as { mode?: "single" | "multiple" | "range" }).mode;
  const isRange = mode === "range";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "group relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
          // A continuous track and rounded row ends are right for a range and
          // wrong for everything else: in multiple mode they make five separate
          // picks read as one span.
          isRange &&
            "data-[selected=true]:bg-primary/15 first:data-[selected=true]:rounded-l-full last:data-[selected=true]:rounded-r-full",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 rounded-full p-0 text-sm font-normal",
          calendarDayButtonModifiers,
        ),
        // Modifier classes land on the cell, so these stay inert and the button
        // rules above are the only source of day styling. Empty strings rather
        // than omissions: a caller's `classNames` spread would otherwise let the
        // stock shadcn defaults back in.
        selected: "",
        today: "",
        outside: "",
        disabled: "",
        range_middle: isRange
          ? "[&>button]:bg-transparent [&>button]:text-foreground [&>button]:ring-0 [&>button]:hover:bg-primary/20"
          : "",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" />;
          if (orientation === "right") return <ChevronRight className="h-4 w-4" />;
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}

