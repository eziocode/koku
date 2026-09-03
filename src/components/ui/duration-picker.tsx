"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DURATION_PRESET_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  type DurationUnit,
  clampDurationMinutes,
  formatResolvedAt,
  fromMinutes,
  toMinutes,
} from "@/lib/time/duration-presets";
import type { TimeFormat } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

/* ─── ChipGroup ───────────────────────────────────────────────────────────── */

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  /** Set when the label alone is not a sufficient accessible name. */
  ariaLabel?: string;
}

export interface ChipGroupProps<T extends string | number> {
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChipOption<T>>;
  /** The group's accessible name. Required: a radiogroup without one is unusable. */
  label: string;
  /** Layout for the group itself, e.g. `"flex gap-2"` or `"grid grid-cols-2 gap-2"`. */
  className?: string;
  chipClassName?: string;
  disabled?: boolean;
}

/**
 * The selectable chip row this app had copy-pasted into four places.
 *
 * Beyond deduplication it adds the two things every copy was missing: an
 * `aria-checked` that reflects real state, and roving-tabindex arrow-key
 * traversal, so the group is one tab stop rather than one stop per chip.
 */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  chipClassName,
  disabled = false,
}: ChipGroupProps<T>) {
  const chips = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // With nothing selected the first chip carries the group's single tab stop.
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function move(from: number, delta: number) {
    const count = options.length;
    const next = (from + delta + count) % count;
    onChange(options[next].value);
    chips.current[next]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    } else if (key === "Home") {
      event.preventDefault();
      move(index, -index);
    } else if (key === "End") {
      event.preventDefault();
      move(index, options.length - 1 - index);
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              chips.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              chipClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── DurationPicker ──────────────────────────────────────────────────────── */

const CUSTOM = "custom";

const UNIT_OPTIONS: ReadonlyArray<ChipOption<DurationUnit>> = [
  { value: "min", label: "min" },
  { value: "hr", label: "hr" },
];

export interface DurationPickerProps {
  /** Whole minutes, or `null` when nothing has been chosen yet. */
  value: number | null;
  onChange: (minutes: number | null) => void;
  /** Defaults to the shared quick choices. Pass a surface's own presets to override. */
  presets?: readonly number[];
  /** Prefix for the preset chip labels, e.g. `"In "` for `"In 5 min"`. */
  labelPrefix?: string;
  maxMinutes?: number;
  /**
   * Base instant for the resolved-time hint; omit to hide the hint entirely.
   *
   * Must be a stable `Date` the caller refreshes when the surface opens, never
   * `new Date()` inline. The hint is only a preview: resolve the real instant
   * again at submit time, so a form left open for ten minutes still schedules
   * from when it was submitted.
   */
  now?: Date;
  timeFormat?: TimeFormat;
  /** A trailing chip outside the numeric range, e.g. open-ended as `0`. */
  extraOption?: { label: string; value: number };
  /** Accessible name for the preset group. */
  label: string;
  idPrefix?: string;
  disabled?: boolean;
  className?: string;
}

export function DurationPicker({
  value,
  onChange,
  presets = DURATION_PRESET_MINUTES,
  labelPrefix = "",
  maxMinutes = MAX_DURATION_MINUTES,
  now,
  timeFormat = "24h",
  extraOption,
  label,
  idPrefix,
  disabled = false,
  className,
}: DurationPickerProps) {
  const autoId = useId();
  const ids = idPrefix ?? `duration-${autoId}`;

  const isPresetValue = (minutes: number | null) =>
    minutes !== null && (presets.includes(minutes) || minutes === extraOption?.value);

  // The unit the custom row is being edited in; `null` means a preset is chosen.
  // The amount itself is derived from `value`, so there is no second copy of it
  // to keep in sync.
  const [customUnit, setCustomUnit] = useState<DurationUnit | null>(() =>
    isPresetValue(value) || value === null ? null : fromMinutes(value).unit,
  );

  // Adjusting state during render rather than in an effect, per React's guidance
  // for state derived from props: a value set from outside (opening the form, or
  // editing an existing record) has to pull the custom row into agreement with
  // it, and an effect here would cascade an extra render every time.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value === null || isPresetValue(value)) {
      setCustomUnit(null);
    } else if (customUnit === null) {
      setCustomUnit(fromMinutes(value).unit);
    }
  }

  const custom =
    customUnit === null || value === null
      ? null
      : { unit: customUnit, amount: customUnit === "hr" ? value / 60 : value };

  const chipValue = custom ? CUSTOM : value === null ? null : String(value);

  const options = useMemo<ReadonlyArray<ChipOption<string>>>(() => {
    const presetChips = presets.map((minutes) => ({
      value: String(minutes),
      label: `${labelPrefix}${minutes} min`,
    }));
    if (extraOption) {
      presetChips.push({ value: String(extraOption.value), label: extraOption.label });
    }
    return [...presetChips, { value: CUSTOM, label: "Custom" }];
  }, [presets, labelPrefix, extraOption]);

  function commitCustom(amount: number, unit: DurationUnit) {
    setCustomUnit(unit);
    const minutes = clampDurationMinutes(toMinutes(amount, unit), maxMinutes);
    setLastValue(minutes);
    onChange(minutes);
  }

  function handleChip(next: string) {
    if (next === CUSTOM) {
      // Seed from whatever is already chosen, so switching to Custom never
      // blanks the field.
      const seed = fromMinutes(
        clampDurationMinutes(value ?? presets[0] ?? MIN_DURATION_MINUTES, maxMinutes),
      );
      commitCustom(seed.amount, seed.unit);
      return;
    }
    setCustomUnit(null);
    setLastValue(Number(next));
    onChange(Number(next));
  }

  function maxAmountFor(unit: DurationUnit) {
    return unit === "hr" ? Math.floor(maxMinutes / 60) : maxMinutes;
  }

  function step(delta: number) {
    if (!custom) return;
    const next = Math.min(
      Math.max(custom.amount + delta, unitFloor(custom.unit)),
      maxAmountFor(custom.unit),
    );
    commitCustom(next, custom.unit);
  }

  function handleUnit(unit: DurationUnit) {
    if (!custom || unit === custom.unit) return;
    // Converting, not reinterpreting: 5 min becomes 1 hr, never 5 hr.
    const minutes = clampDurationMinutes(toMinutes(custom.amount, custom.unit), maxMinutes);
    const amount = unit === "hr" ? Math.max(1, Math.round(minutes / 60)) : minutes;
    commitCustom(Math.min(amount, maxAmountFor(unit)), unit);
  }

  const atFloor = custom ? toMinutes(custom.amount, custom.unit) <= MIN_DURATION_MINUTES : true;
  const atCeiling = custom ? toMinutes(custom.amount, custom.unit) >= maxMinutes : true;
  const hint =
    now && value !== null && value > 0 ? formatResolvedAt(value, now, timeFormat) : null;

  return (
    <div className={cn("space-y-3", className)}>
      <ChipGroup
        value={chipValue}
        onChange={handleChip}
        options={options}
        label={label}
        disabled={disabled}
      />

      {custom ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${ids}-amount`} className="text-xs text-muted-foreground">
              Length
            </Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Decrease duration"
                disabled={disabled || atFloor}
                onClick={() => step(-1)}
                className="flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <Input
                id={`${ids}-amount`}
                type="number"
                inputMode="numeric"
                min={unitFloor(custom.unit)}
                max={maxAmountFor(custom.unit)}
                value={custom.amount}
                disabled={disabled}
                aria-describedby={hint ? `${ids}-hint` : undefined}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  commitCustom(Math.round(next), custom.unit);
                }}
                className="min-h-11 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Increase duration"
                disabled={disabled || atCeiling}
                onClick={() => step(1)}
                className="flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <ChipGroup
            value={custom.unit}
            onChange={handleUnit}
            options={UNIT_OPTIONS}
            label="Duration unit"
            disabled={disabled}
            chipClassName="w-14 text-center"
          />
        </div>
      ) : null}

      {hint ? (
        <p id={`${ids}-hint`} className="text-xs text-muted-foreground" aria-live="polite">
          {`→ at ${hint}`}
        </p>
      ) : null}
    </div>
  );
}

function unitFloor(unit: DurationUnit): number {
  return unit === "hr" ? 1 : MIN_DURATION_MINUTES;
}
