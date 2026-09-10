import * as React from "react";

import { cn } from "@/lib/utils";

/** Render the toolbar's markdown subset as React nodes, never HTML strings. */
function renderInline(text: string): React.ReactNode[] {
  const pattern = /\*\*([^*]+)\*\*|~~([^~]+)~~|(?<!\w)_([^_]+)_(?!\w)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    nodes.push(text.slice(offset, index));
    if (match[1]) nodes.push(<strong key={index}>{renderInline(match[1])}</strong>);
    else if (match[2]) nodes.push(<del key={index}>{renderInline(match[2])}</del>);
    else if (match[3]) nodes.push(<em key={index}>{renderInline(match[3])}</em>);
    else nodes.push(<a key={index} href={match[5]} target="_blank" rel="noopener noreferrer">{renderInline(match[4])}</a>);
    offset = index + match[0].length;
  }
  nodes.push(text.slice(offset));
  return nodes;
}

type Block = { kind: "list"; tag: "ul" | "ol"; items: string[] } | { kind: "line"; text: string };

/** Group lines into blocks first so consecutive bullets share one list element. */
function groupBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const item = bullet ?? numbered;
    if (!item) {
      blocks.push({ kind: "line", text: line });
      continue;
    }
    const tag = bullet ? "ul" : "ol";
    const last = blocks.at(-1);
    if (last?.kind === "list" && last.tag === tag) last.items.push(item[1]);
    else blocks.push({ kind: "list", tag, items: [item[1]] });
  }
  return blocks;
}

function renderBlock(lines: string[]): React.ReactNode[] {
  return groupBlocks(lines).map((block, index) => {
    if (block.kind === "line") {
      return block.text.trim() === "" ? <br key={index} /> : <p key={index}>{renderInline(block.text)}</p>;
    }
    const Tag = block.tag;
    return (
      <Tag key={index} className={`${Tag === "ul" ? "list-disc" : "list-decimal"} pl-5`}>
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
      </Tag>
    );
  });
}

export function MarkdownText({
  text,
  className,
  containerRef,
}: {
  text: string;
  className?: string;
  /** Exposes the rendered container so callers can measure clamp overflow (see `useClampOverflow`). */
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  const content = React.useMemo(() => renderBlock(text.split("\n")), [text]);
  return (
    <div
      ref={containerRef}
      className={cn("space-y-1 text-sm [&_p]:leading-relaxed", className)}
    >{content}</div>
  );
}
