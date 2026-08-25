"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { DEFAULT_FORCES, type GraphForces } from "@/components/graph/graph-canvas";
import { cn } from "@/lib/utils";

interface ForceControl {
  key: keyof GraphForces;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const CONTROLS: ForceControl[] = [
  { key: "gravity", label: "Center force", hint: "Pull toward the middle", min: 0, max: 3, step: 0.05 },
  { key: "scalingRatio", label: "Repel force", hint: "Push nodes apart", min: 1, max: 60, step: 1 },
  { key: "edgeWeightInfluence", label: "Link force", hint: "How hard links pull", min: 0, max: 3, step: 0.1 },
  { key: "slowDown", label: "Damping", hint: "Higher settles calmer", min: 1, max: 20, step: 0.5 },
];

/**
 * Obsidian-style collapsible forces panel. Floats over the canvas rather than
 * stacking above it so the graph keeps the full frame.
 */
export function GraphForcesPanel({
  forces,
  onChange,
  className,
}: {
  forces: GraphForces;
  onChange: (next: GraphForces) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isDefault = CONTROLS.every((control) => forces[control.key] === DEFAULT_FORCES[control.key]);

  return (
    <div
      className={cn(
        "w-[210px] overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Forces
        </button>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FORCES)}
            title="Reset forces"
            aria-label="Reset forces"
            className="px-2 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2.5">
          {CONTROLS.map((control) => (
            <label key={control.key} className="block" title={control.hint}>
              <span className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                {control.label}
                <span className="tabular-nums text-foreground">{forces[control.key]}</span>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={forces[control.key]}
                onChange={(event) =>
                  onChange({ ...forces, [control.key]: Number(event.target.value) })
                }
                className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
