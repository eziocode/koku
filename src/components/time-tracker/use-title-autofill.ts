"use client";

import { useState } from "react";

import { normalizeText } from "@/lib/search/match";
import { useTitleSuggestion } from "@/lib/storage/hooks/use-title-suggestion";
import { NONE_VALUE } from "@/lib/ui/list-thresholds";
import type { TitleSuggestion } from "@/lib/time-tracking/title-suggestions";

interface UseTitleAutofillArgs {
  /** Only active when creating — never rewrites an entry being edited. */
  isCreating: boolean;
  title: string;
  projectId: string;
  categoryId: string;
  tags: string[];
  onProjectIdChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
}

interface UseTitleAutofillResult {
  /** `null` when there's nothing to offer, already applied, or dismissed for this title. */
  suggestion: TitleSuggestion | null;
  apply: () => void;
  dismiss: () => void;
  /** Clears dismiss/apply memory — call on Save & New and on timer start/reset. */
  reset: () => void;
}

/**
 * Shared state machine so entry-form and timer don't fork the autofill logic.
 *
 * Apply only fills fields still at `NONE_VALUE` and unions tags — a value the
 * user picked manually is never touched. `dismissedFor`/`appliedFor` are keyed
 * on the normalized title so the chip doesn't re-offer on the next keystroke
 * of the same title.
 */
export function useTitleAutofill({
  isCreating,
  title,
  projectId,
  categoryId,
  tags,
  onProjectIdChange,
  onCategoryIdChange,
  onTagsChange,
}: UseTitleAutofillArgs): UseTitleAutofillResult {
  const rawSuggestion = useTitleSuggestion(isCreating ? title : "");
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  const key = normalizeText(title);

  const suggestion =
    isCreating && rawSuggestion && dismissedFor !== key && appliedFor !== key ? rawSuggestion : null;

  function apply() {
    if (!suggestion) {
      return;
    }

    if (suggestion.projectId && projectId === NONE_VALUE) {
      onProjectIdChange(suggestion.projectId);
    }
    if (suggestion.categoryId && categoryId === NONE_VALUE) {
      onCategoryIdChange(suggestion.categoryId);
    }
    if (suggestion.tags.length) {
      onTagsChange(Array.from(new Set([...tags, ...suggestion.tags])));
    }

    setAppliedFor(key);
  }

  function dismiss() {
    setDismissedFor(key);
  }

  function reset() {
    setDismissedFor(null);
    setAppliedFor(null);
  }

  return { suggestion, apply, dismiss, reset };
}
