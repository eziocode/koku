"use client";

import { KeyboardEvent, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { filterByQuery } from "@/lib/search/match";
import { TAG_MAX_SUGGESTIONS, TAG_SEARCH_THRESHOLD, TAG_VISIBLE_SUGGESTIONS } from "@/lib/ui/list-thresholds";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  maxSuggestions?: number;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  maxSuggestions = TAG_MAX_SUGGESTIONS,
  placeholder = "Add tag…",
  className,
  id,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(next: string) {
    setInputValue(next);
    if (!next) {
      setExpanded(false);
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue("");
    setExpanded(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && inputValue.trim()) {
      event.preventDefault();
      addTag(inputValue);
    } else if (event.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }

  const unusedSuggestions = suggestions.filter((s) => !value.includes(s)).slice(0, maxSuggestions);
  const searchedSuggestions =
    unusedSuggestions.length > TAG_SEARCH_THRESHOLD && inputValue.trim()
      ? filterByQuery(unusedSuggestions, inputValue, (tag) => tag)
      : unusedSuggestions;
  const visibleSuggestions = searchedSuggestions.slice(0, expanded ? maxSuggestions : TAG_VISIBLE_SUGGESTIONS);
  const hiddenCount = searchedSuggestions.length - visibleSuggestions.length;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Input + chips container */}
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-0.5 rounded-full text-primary/60 hover:text-primary focus:outline-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[100px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Suggestions */}
      {searchedSuggestions.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5", expanded && "max-h-24 overflow-y-auto")}>
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              + {s}
            </button>
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
