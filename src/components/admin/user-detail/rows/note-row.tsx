"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, tiptapToPlainText, type AdminRow } from "@/lib/admin-data";
import { useClampOverflow } from "@/lib/hooks/use-clamp-overflow";
import type { TimeFormat } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

/** Quick notes open with a "Logged … " stamp paragraph — see `buildQuickNoteStamp`. */
const NOTE_STAMP_PATTERN = /^Logged .+/;

/**
 * One note in the admin Notes panel.
 *
 * Note content is a TipTap doc flattened to newline-separated lines, and quick
 * notes carry a "Logged … while tracking …" stamp as their first paragraph. That
 * stamp is lifted out as its own metadata line so the body starts with what the
 * user actually wrote, wrapped and clamped rather than truncated to one line.
 */
export function AdminNoteRow({
  row,
  timeFormat,
  linkCount = 0,
}: {
  row: AdminRow;
  timeFormat: TimeFormat;
  /** How many other notes this one links to or from. */
  linkCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const { stamp, body } = useMemo(() => {
    const lines = tiptapToPlainText(row.content)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const hasStamp = lines.length > 1 && NOTE_STAMP_PATTERN.test(lines[0]);
    return {
      stamp: hasStamp ? lines[0] : null,
      body: (hasStamp ? lines.slice(1) : lines).join("\n"),
    };
  }, [row.content]);

  const { ref: bodyRef, overflowing } = useClampOverflow([body, expanded]);
  const showToggle = overflowing || expanded;
  const tags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [];
  const slug = row.slug ? String(row.slug) : null;
  // A note created and never touched again shows one date, not the same date twice.
  const createdAt = row.createdAt ? String(row.createdAt) : null;
  const updatedAt = row.updatedAt ? String(row.updatedAt) : null;
  const edited = Boolean(createdAt && updatedAt && createdAt.slice(0, 16) !== updatedAt.slice(0, 16));

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.title || "Untitled note")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(updatedAt ?? createdAt, timeFormat)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {slug ? <span className="font-mono">{slug}</span> : null}
        {slug && createdAt ? " · " : null}
        {createdAt ? `Created ${formatDate(createdAt, timeFormat)}` : null}
        {edited ? " · Edited since" : null}
      </p>
      {stamp ? <p className="text-xs italic text-muted-foreground/80">{stamp}</p> : null}
      {(tags.length > 0 || linkCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          {linkCount > 0 ? (
            <Badge variant="outline">{linkCount} linked note{linkCount === 1 ? "" : "s"}</Badge>
          ) : null}
        </div>
      )}
      <p
        ref={bodyRef}
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {body || "No text"}
      </p>
      {showToggle ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
