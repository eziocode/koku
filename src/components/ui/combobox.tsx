"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { filterByQuery } from "@/lib/search/match";
import {
  COMBOBOX_MAX_ROWS,
  COMBOBOX_MAX_ROWS_COMPACT,
  COMBOBOX_PAGE_SIZE,
  COMBOBOX_SEARCH_THRESHOLD,
} from "@/lib/ui/list-thresholds";

export interface ComboboxOption {
  value: string;
  label: string;
  keywords?: string[];
  color?: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Sticky top row, never filtered out or paged away. `null` = required field, no none row. */
  noneOption?: { value: string; label: string } | null;
  searchThreshold?: number;
  pageSize?: number;
  maxRows?: number;
  maxRowsCompact?: number;
  /** Pinned bottom row, e.g. "+ New project". */
  action?: { label: string; onSelect: () => void };
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
}

// 36px row height, matching SelectItem's `py-1.5 text-sm`.
const ROW_HEIGHT_REM = 2.25;
const LIST_PADDING_REM = 0.5;

function rowsToMaxHeight(rows: number): string {
  return `calc(${rows} * ${ROW_HEIGHT_REM}rem + ${LIST_PADDING_REM}rem)`;
}

const TRIGGER_CLASSNAME =
  "flex h-10 w-full items-center justify-between rounded-[calc(var(--radius)-2px)] border border-border bg-background px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1";

export function Combobox({
  options,
  value,
  onValueChange,
  id,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No results.",
  noneOption = null,
  searchThreshold = COMBOBOX_SEARCH_THRESHOLD,
  pageSize = COMBOBOX_PAGE_SIZE,
  maxRows = COMBOBOX_MAX_ROWS,
  maxRowsCompact = COMBOBOX_MAX_ROWS_COMPACT,
  action,
  disabled,
  ariaLabel,
  className,
  contentClassName,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(pageSize);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const showSearch = options.length > searchThreshold;
  const listId = React.useId();

  const filtered = React.useMemo(
    () => filterByQuery(options, query, (option) => option.label, (option) => option.keywords),
    [options, query],
  );

  React.useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  React.useEffect(() => {
    setVisibleCount(pageSize);
  }, [query, options.length, pageSize]);

  const hasMore = visibleCount < filtered.length;

  React.useEffect(() => {
    if (!open || !hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + pageSize, filtered.length));
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasMore, pageSize, filtered.length]);

  const selected: ComboboxOption | { value: string; label: string } | undefined =
    noneOption && value === noneOption.value ? noneOption : options.find((option) => option.value === value);
  const selectedColor: string | undefined = selected && "color" in selected ? selected.color : undefined;

  function select(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(TRIGGER_CLASSNAME, className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedColor && (
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedColor }}
              />
            )}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            "z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none",
            contentClassName,
          )}
        >
          <Command shouldFilter={false} className="flex flex-col">
            <div className={cn("border-b border-border", !showSearch && "sr-only")}>
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List
              id={listId}
              className={cn(
                "overflow-y-auto p-1",
                `max-h-[min(${rowsToMaxHeight(maxRowsCompact)},var(--radix-popover-content-available-height,60vh))]`,
                `sm:max-h-[min(${rowsToMaxHeight(maxRows)},var(--radix-popover-content-available-height,60vh))]`,
              )}
            >
              {noneOption && (
                <Command.Item
                  value={noneOption.label}
                  onSelect={() => select(noneOption.value)}
                  className="relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none data-[selected=true]:bg-muted"
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {value === noneOption.value && <Check className="h-4 w-4" />}
                  </span>
                  {noneOption.label}
                </Command.Item>
              )}

              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
              ) : (
                filtered.slice(0, visibleCount).map((option) => (
                  <Command.Item
                    key={option.value}
                    value={option.label}
                    disabled={option.disabled}
                    onSelect={() => select(option.value)}
                    className="relative flex w-full cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-sm outline-none data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      {value === option.value && <Check className="h-4 w-4" />}
                    </span>
                    {option.color && (
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.description && (
                      <span className="shrink-0 text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </Command.Item>
                ))
              )}

              {hasMore && (
                <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
                  Loading more…
                </div>
              )}
            </Command.List>
            {action && (
              <div className="border-t border-border p-1">
                <button
                  type="button"
                  onClick={() => {
                    action.onSelect();
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
                >
                  {action.label}
                </button>
              </div>
            )}
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
