import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the lightweight markdown produced by `RichTextarea` — bold, italic,
 * strikethrough, links, bulleted/numbered lists — as HTML.
 *
 * Deliberately not a full markdown parser: notes/description fields stay
 * plain strings in storage (see `RichTextarea`'s docstring), so this only
 * needs to understand the handful of markers that toolbar can produce.
 * Escapes the source text first, so nothing typed by a user is ever
 * interpreted as HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderBlock(lines: string[]): string {
  const html: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  function flushList() {
    if (!list) return;
    const items = list.items.map((item) => `<li>${item}</li>`).join("");
    html.push(`<${list.tag} class="${list.tag === "ul" ? "list-disc" : "list-decimal"} pl-5">${items}</${list.tag}>`);
    list = null;
  }

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (bullet) {
      if (list?.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(renderInline(bullet[1]));
      continue;
    }

    if (numbered) {
      if (list?.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(renderInline(numbered[1]));
      continue;
    }

    flushList();
    html.push(line.trim() === "" ? "<br />" : `<p>${renderInline(line)}</p>`);
  }

  flushList();
  return html.join("");
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const html = React.useMemo(() => renderBlock(text.split("\n")), [text]);
  // eslint-disable-next-line react/no-danger -- `html` is built entirely from `escapeHtml`-passed, regex-matched fragments above.
  return <div className={cn("space-y-1 text-sm [&_p]:leading-relaxed", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
