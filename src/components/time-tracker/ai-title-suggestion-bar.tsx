"use client";

import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AiTitleSuggestion } from "@/components/time-tracker/use-ai-title-suggestion";

interface AiTitleSuggestionBarProps {
  suggestion: AiTitleSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}

/** Pure presentation, mirrors TitleSuggestionBar's shape for the AI fallback case. */
export function AiTitleSuggestionBar({ suggestion, onApply, onDismiss }: AiTitleSuggestionBarProps) {
  const parts = [suggestion.projectName, suggestion.categoryName, ...suggestion.tags.map((tag) => `#${tag}`)].filter(
    Boolean,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="min-w-0 truncate">
        <Sparkles className="mr-1 inline h-3 w-3 text-primary" aria-hidden="true" />
        Koku AI suggests: {parts.length ? parts.join(" · ") : "no project or tags"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={onApply}>
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss AI suggestion"
          onClick={onDismiss}
          className="h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
