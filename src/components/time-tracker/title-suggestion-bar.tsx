"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TitleSuggestion } from "@/lib/time-tracking/title-suggestions";

interface TitleSuggestionBarProps {
  suggestion: TitleSuggestion;
  projectName: string | null;
  categoryName: string | null;
  onApply: () => void;
  onDismiss: () => void;
}

/** Pure presentation — owns no form state. Nothing fills until Apply is clicked. */
export function TitleSuggestionBar({
  suggestion,
  projectName,
  categoryName,
  onApply,
  onDismiss,
}: TitleSuggestionBarProps) {
  const parts = [projectName, categoryName, ...suggestion.tags.map((tag) => `#${tag}`)].filter(Boolean);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="min-w-0 truncate">
        <span aria-hidden="true">↳</span> Last used: {parts.length ? parts.join(" · ") : "no project or tags"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={onApply}>
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
          className="h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
