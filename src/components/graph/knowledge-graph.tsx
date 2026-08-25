"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";

import {
  DEFAULT_FORCES,
  GraphCanvas,
  type CanvasEdge,
  type CanvasNode,
  type GraphForces,
} from "@/components/graph/graph-canvas";
import { GraphForcesPanel } from "@/components/graph/graph-forces-panel";
import { GRAPH_FRAME_HEIGHT } from "@/components/graph/graph-frame";
import { GraphLegend } from "@/components/graph/graph-legend";
import { GraphSideRail } from "@/components/graph/graph-side-rail";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSegmentVariantColor } from "@/lib/charts/theme";
import {
  detectCommunities,
  getGraphColorByIndex,
  getGraphColorByKey,
} from "@/lib/graph/palette";
import { kokuDb } from "@/lib/storage/db";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useLiveQuery } from "@/lib/storage/use-live-query";

type ColorMode = "cluster" | "tag";

const COLOR_MODES: { value: ColorMode; label: string; hint: string }[] = [
  { value: "cluster", label: "Clusters", hint: "Colour by linked group" },
  { value: "tag", label: "Tags", hint: "Colour by first tag" },
];

interface NoteNode {
  id: string;
  title: string;
  tags: string[];
  degree: number;
  color: string;
  /** Base colour of the group — what the legend swatch shows. */
  groupColor: string;
  groupKey: string;
  groupLabel: string;
  /** Node is coloured by its own id, not by a shared group colour. */
  mixed: boolean;
}

export function KnowledgeGraph() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { notes } = useNotes();
  const noteLinks = useLiveQuery(() => kokuDb.noteLinks.toArray(), [], []);

  const [colorMode, setColorMode] = useState<ColorMode>("cluster");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [forces, setForces] = useState<GraphForces>(DEFAULT_FORCES);

  const isDark = resolvedTheme === "dark";

  const links = useMemo(
    () =>
      noteLinks
        .filter((link) => link.sourceNoteId !== link.targetNoteId)
        .map((link) => ({
          id: link.id,
          source: link.sourceNoteId,
          target: link.targetNoteId,
        })),
    [noteLinks],
  );

  const noteNodes = useMemo<NoteNode[]>(() => {
    const ids = notes.map((note) => note.id);
    const present = new Set(ids);
    const validLinks = links.filter(
      (link) => present.has(link.source) && present.has(link.target),
    );

    const degrees = new Map<string, number>();
    validLinks.forEach((link) => {
      degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
      degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
    });

    const communities = detectCommunities(ids, validLinks);

    return notes.map((note) => {
      const degree = degrees.get(note.id) ?? 0;
      const firstTag = note.tags.find((tag) => tag.trim());

      if (colorMode === "tag") {
        return {
          id: note.id,
          title: note.title,
          tags: note.tags,
          degree,
          // Untagged notes get their own hue rather than a shared grey, so a
          // mostly-untagged vault still reads as a colourful graph.
          color: firstTag
            ? getSegmentVariantColor(getGraphColorByKey(firstTag.toLowerCase()), note.id)
            : getGraphColorByKey(note.id),
          groupColor: firstTag
            ? getGraphColorByKey(firstTag.toLowerCase())
            : getGraphColorByKey("__untagged"),
          groupKey: firstTag ? firstTag.toLowerCase() : "__untagged",
          groupLabel: firstTag ? `#${firstTag.toLowerCase()}` : "Untagged",
          mixed: !firstTag,
        };
      }

      // Orphans belong to no cluster, so they are keyed by their own id — same
      // reasoning as untagged notes above.
      const community = communities.get(note.id) ?? 0;
      const clusterColor = getGraphColorByIndex(community);
      return {
        id: note.id,
        title: note.title,
        tags: note.tags,
        degree,
        // Notes inside a cluster share the cluster hue but each gets a shifted
        // variant, so a single big cluster is still readable as many notes.
        color: degree === 0
          ? getGraphColorByKey(note.id)
          : getSegmentVariantColor(clusterColor, note.id),
        groupColor: degree === 0 ? getGraphColorByKey("__orphan") : clusterColor,
        groupKey: degree === 0 ? "__orphan" : `cluster-${community}`,
        groupLabel: degree === 0 ? "Unlinked" : `Cluster ${community + 1}`,
        mixed: degree === 0,
      };
    });
  }, [colorMode, links, notes]);

  const canvasNodes = useMemo<CanvasNode[]>(
    () =>
      noteNodes.map((node) => ({
        id: node.id,
        label: node.title || "Untitled",
        color: node.color,
        size: Math.min(24, 6 + Math.sqrt(node.degree) * 4),
      })),
    [noteNodes],
  );

  const canvasEdges = useMemo<CanvasEdge[]>(() => {
    const present = new Set(noteNodes.map((node) => node.id));
    return links
      .filter((link) => present.has(link.source) && present.has(link.target))
      .map((link) => ({ ...link, weight: 0.15 }));
  }, [links, noteNodes]);

  const allTags = useMemo(
    () =>
      Array.from(
        new Set(notes.flatMap((note) => note.tags.map((tag) => tag.trim().toLowerCase()))),
      )
        .filter(Boolean)
        .sort(),
    [notes],
  );

  const legendGroups = useMemo(() => {
    const totals = new Map<
      string,
      { label: string; color: string; count: number; mixed: boolean }
    >();
    noteNodes.forEach((node) => {
      const existing = totals.get(node.groupKey);
      if (existing) {
        existing.count += 1;
        return;
      }
      totals.set(node.groupKey, {
        label: node.groupLabel,
        color: node.groupColor,
        count: 1,
        mixed: node.mixed,
      });
    });

    return Array.from(totals.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [noteNodes]);

  const trimmedQuery = query.trim().toLowerCase();
  const highlightIds = useMemo(() => {
    if (!trimmedQuery && !activeTag) {
      return null;
    }

    const matches = noteNodes.filter((node) => {
      const matchesQuery = trimmedQuery
        ? node.title.toLowerCase().includes(trimmedQuery) ||
          node.tags.some((tag) => tag.toLowerCase().includes(trimmedQuery))
        : true;
      const matchesTag = activeTag
        ? node.tags.some((tag) => tag.trim().toLowerCase() === activeTag)
        : true;
      return matchesQuery && matchesTag;
    });

    return new Set(matches.map((node) => node.id));
  }, [activeTag, noteNodes, trimmedQuery]);

  const hovered = hoveredId
    ? noteNodes.find((node) => node.id === hoveredId) ?? null
    : null;

  const filtersActive = Boolean(trimmedQuery || activeTag);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-card", GRAPH_FRAME_HEIGHT)}>
      {noteNodes.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="font-medium text-foreground">No notes yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Write a note and link others with <code>[[wiki links]]</code> — clusters appear here as
            your ideas connect.
          </p>
        </div>
      ) : (
        <>
          <GraphCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            isDark={isDark}
            highlightIds={highlightIds}
            onNodeClick={(id) => router.push(`/notes?id=${id}`)}
            onNodeHover={setHoveredId}
            forces={forces}
            className="h-full w-full"
          />

          {/* Left rail: search, colour mode, tags, legend, forces — all floating
              over the canvas so the graph itself keeps the whole frame. */}
          <GraphSideRail>
            <div className="pointer-events-auto relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a note…"
                className="border-border/60 bg-card/90 pl-9 text-sm shadow-sm backdrop-blur"
              />
            </div>

            <div className="pointer-events-auto inline-flex rounded-lg border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur">
              {COLOR_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.hint}
                  onClick={() => setColorMode(mode.value)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    colorMode === mode.value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveTag(null);
                }}
                className="pointer-events-auto inline-flex w-fit items-center gap-1 rounded-md border border-border/60 bg-card/90 px-2 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear focus
              </button>
            )}

            {allTags.length > 0 && (
              <div className="pointer-events-auto flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-card/90 p-2 shadow-sm backdrop-blur">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag((current) => (current === tag ? null : tag))}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      activeTag === tag
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <GraphLegend
              className="pointer-events-auto"
              title={colorMode === "cluster" ? "Clusters" : "Tags"}
              items={legendGroups.map((group) => ({
                key: group.key,
                label: group.label,
                color: group.color,
                mixed: group.mixed,
                meta: `${group.count}`,
              }))}
            />

            <GraphForcesPanel className="pointer-events-auto" forces={forces} onChange={setForces} />
          </GraphSideRail>

          {hovered ? (
            <Card className="absolute right-4 top-4 max-w-xs border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: hovered.color }}
                />
                <div>
                  <p className="font-semibold text-foreground">{hovered.title || "Untitled"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hovered.degree} {hovered.degree === 1 ? "link" : "links"} · {hovered.groupLabel}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {hovered.tags.length
                      ? hovered.tags.map((tag) => `#${tag}`).join(" ")
                      : "No tags"}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <p className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-border/60 bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {noteNodes.length} notes · {canvasEdges.length} links ·{" "}
            {legendGroups.filter((group) => group.key !== "__orphan").length} groups
            {highlightIds ? ` · ${highlightIds.size} in focus` : ""}
          </p>
        </>
      )}
    </div>
  );
}
