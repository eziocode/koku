"use client";

import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { TITLE_MIN_QUERY } from "@/lib/ui/list-thresholds";

const AI_SUGGEST_DEBOUNCE_MS = 700;

export interface AiTitleSuggestion {
  projectName: string | null;
  categoryName: string | null;
  tags: string[];
}

interface UseAiTitleSuggestionArgs {
  /** Only asked when the statistical matcher already came up empty. */
  enabled: boolean;
  title: string;
  existingProjects: string[];
  existingCategories: string[];
}

/**
 * A slower, opt-in fallback for when Koku's statistical title matcher (see
 * `useTitleSuggestion`) finds nothing for a title never logged before. Only
 * fires when `enabled` (the caller passes `!statisticalSuggestion`) and a
 * verified API-key AI connection exists — CLI/org-login connections have no
 * structured-output protocol, so this stays api-key only.
 */
export function useAiTitleSuggestion({
  enabled,
  title,
  existingProjects,
  existingCategories,
}: UseAiTitleSuggestionArgs) {
  const { verifiedConnections } = useAiKeys();
  const connection = verifiedConnections.find((key) => key.authMode === "api-key") ?? null;
  const debouncedTitle = useDebouncedValue(title.trim(), AI_SUGGEST_DEBOUNCE_MS);
  const [suggestion, setSuggestion] = useState<AiTitleSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const active = enabled && Boolean(connection) && debouncedTitle.length >= TITLE_MIN_QUERY;

  async function fetchSuggestion(activeConnection: NonNullable<typeof connection>, signal: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          provider: activeConnection.provider,
          apiKey: activeConnection.apiKey,
          title: debouncedTitle,
          existingProjects,
          existingCategories,
        }),
      });
      const data: AiTitleSuggestion | null = response.ok ? await response.json() : null;
      const hasContent = Boolean(data?.projectName || data?.categoryName || data?.tags?.length);
      setSuggestion(hasContent ? data : null);
    } catch {
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Render already gates on `active` (see the return below), so an
    // inactive effect run simply does nothing rather than clearing state
    // synchronously from within the effect body.
    if (!active || !connection || dismissedFor === debouncedTitle) {
      return;
    }

    const controller = new AbortController();
    // Cancellable fetch-on-debounce, same shape as AdminClient's `load`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSuggestion(connection, controller.signal);
    return () => controller.abort();
    // existingProjects/existingCategories intentionally excluded: they are
    // recomputed every render from live Dexie data, and including them would
    // refire this request on every keystroke elsewhere in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, connection, debouncedTitle, dismissedFor]);

  function dismiss() {
    setDismissedFor(debouncedTitle);
    setSuggestion(null);
  }

  return {
    suggestion: active ? suggestion : null,
    loading: active && loading,
    dismiss,
  };
}
