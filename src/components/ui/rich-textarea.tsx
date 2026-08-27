"use client";

import * as React from "react";
import { Bold, Italic, Link2, List, ListOrdered, Strikethrough } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface RichTextareaProps extends Omit<React.ComponentProps<"textarea">, "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

type InlineMark = { prefix: string; suffix: string };

const MARKS = {
  bold: { prefix: "**", suffix: "**" },
  italic: { prefix: "_", suffix: "_" },
  strike: { prefix: "~~", suffix: "~~" },
} satisfies Record<string, InlineMark>;

/**
 * Toggles a markdown wrapper around the current selection.
 *
 * Notes/description fields are stored as plain strings across the app (task
 * notes, entry notes, timer notes) — swapping them for a rich-doc editor would
 * mean a schema migration for every one of those tables. Markdown syntax gets
 * the same "bold a word, bullet a list" capability without touching storage:
 * it is still just a string, only one that reads nicely formatted wherever it
 * is rendered through a markdown renderer.
 */
function toggleInlineMark(textarea: HTMLTextAreaElement, mark: InlineMark) {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);

  const alreadyWrapped =
    selected.startsWith(mark.prefix) && selected.endsWith(mark.suffix) && selected.length >= mark.prefix.length + mark.suffix.length;

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  if (alreadyWrapped) {
    const unwrapped = selected.slice(mark.prefix.length, selected.length - mark.suffix.length);
    return {
      next: `${before}${unwrapped}${after}`,
      selectionStart,
      selectionEnd: selectionStart + unwrapped.length,
    };
  }

  const wrapped = `${mark.prefix}${selected || "text"}${mark.suffix}`;
  return {
    next: `${before}${wrapped}${after}`,
    selectionStart: selectionStart + mark.prefix.length,
    selectionEnd: selectionStart + mark.prefix.length + (selected || "text").length,
  };
}

/** Wraps selection as a markdown link `[text](url)`, prompting for the URL. Only http(s) allowed. */
function toggleLink(textarea: HTMLTextAreaElement) {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);

  const existingLink = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(selected);
  const url = window.prompt("Link URL", existingLink?.[2] ?? "https://");
  if (url === null) return null;

  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    window.alert("Only http:// and https:// links are allowed.");
    return null;
  }

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const label = existingLink?.[1] || selected || "link text";

  if (!trimmed) {
    return { next: `${before}${label}${after}`, selectionStart, selectionEnd: selectionStart + label.length };
  }

  const wrapped = `[${label}](${trimmed})`;
  return {
    next: `${before}${wrapped}${after}`,
    selectionStart,
    selectionEnd: selectionStart + wrapped.length,
  };
}

/** Prefixes every selected line (or the current line, with no selection) with a list marker. */
function toggleLinePrefix(textarea: HTMLTextAreaElement, makePrefix: (index: number) => string) {
  const { value, selectionStart, selectionEnd } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndSearch = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndSearch === -1 ? value.length : lineEndSearch;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every((line) => /^\s*([-*]|\d+\.)\s/.test(line) || line.trim() === "");

  const nextLines = lines.map((line, index) => {
    if (allPrefixed) {
      return line.replace(/^(\s*)([-*]|\d+\.)\s/, "$1");
    }
    if (line.trim() === "") return line;
    return `${makePrefix(index)}${line}`;
  });

  const nextBlock = nextLines.join("\n");
  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);

  return {
    next: `${before}${nextBlock}${after}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + nextBlock.length,
  };
}

/**
 * A `Textarea` with a lightweight markdown formatting toolbar — bold, italic,
 * strikethrough, links, bulleted and numbered lists. Selecting text and clicking a
 * button (or its shortcut) wraps/prefixes the selection with markdown syntax;
 * clicking again on an already-formatted selection removes it.
 */
export function RichTextarea({ value, onChange, className, id, ...props }: RichTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  function apply(
    mutate: (textarea: HTMLTextAreaElement) => { next: string; selectionStart: number; selectionEnd: number } | null,
  ) {
    const textarea = ref.current;
    if (!textarea) return;

    const result = mutate(textarea);
    if (!result) return;
    const { next, selectionStart, selectionEnd } = result;
    onChange(next);

    // The value prop hasn't re-rendered into the DOM yet — restore the
    // selection on the next tick so the cursor lands where the edit left it
    // instead of jumping to the end.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === "b") {
      event.preventDefault();
      apply((textarea) => toggleInlineMark(textarea, MARKS.bold));
    } else if (event.key === "i") {
      event.preventDefault();
      apply((textarea) => toggleInlineMark(textarea, MARKS.italic));
    } else if (event.key === "k") {
      event.preventDefault();
      apply(toggleLink);
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-[calc(var(--radius)-2px)] border border-border", className)}>
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/40 p-1">
        <ToolbarButton label="Bold (⌘B)" onClick={() => apply((t) => toggleInlineMark(t, MARKS.bold))}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic (⌘I)" onClick={() => apply((t) => toggleInlineMark(t, MARKS.italic))}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" onClick={() => apply((t) => toggleInlineMark(t, MARKS.strike))}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link (⌘K)" onClick={() => apply(toggleLink)}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton label="Bulleted list" onClick={() => apply((t) => toggleLinePrefix(t, () => "- "))}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => apply((t) => toggleLinePrefix(t, (index) => `${index + 1}. `))}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <Textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="rounded-none border-0 shadow-none focus-visible:ring-0"
        {...props}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
