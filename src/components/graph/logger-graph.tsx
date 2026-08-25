"use client";

import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
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
import {
  DEFAULT_FILTERS,
  LogFilters,
  type LogFilterState,
} from "@/components/time-tracker/log-filters";
import { Card } from "@/components/ui/card";
import {
  LOGGER_KIND_COLORS,
  buildLoggerGraph,
  type LoggerColorMode,
  type LoggerGraphShape,
} from "@/lib/graph/logger-graph-model";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { cn, formatDuration } from "@/lib/utils";

const SHAPES: { value: LoggerGraphShape; label: string; hint: string }[] = [
  { value: "aggregate", label: "Aggregate", hint: "One node per category, project, and tag" },
  { value: "entries", label: "Entries", hint: "One node per logged entry" },
];

const COLOR_MODES: { value: LoggerColorMode; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "project", label: "Project" },
  { value: "kind", label: "Node type" },
];

/** Default window — a month of work reads as a graph; all-time rarely does. */
const DEFAULT_LOGGER_FILTERS: LogFilterState = {
  ...DEFAULT_FILTERS,
  from: format(subDays(new Date(), 29), "yyyy-MM-dd"),
  to: format(new Date(), "yyyy-MM-dd"),
};

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-muted/40 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LoggerGraph() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [filters, setFilters] = useState<LogFilterState>(DEFAULT_LOGGER_FILTERS);
  const [shape, setShape] = useState<LoggerGraphShape>("aggregate");
  const [colorMode, setColorMode] = useState<LoggerColorMode>("category");
  const [includeTags, setIncludeTags] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [forces, setForces] = useState<GraphForces>(DEFAULT_FORCES);

  const { projects } = useProjects();
  const { categories } = useCategories();

  const entryFilters = useMemo(
    () => ({
      from: filters.from
        ? startOfDay(parseISO(`${filters.from}T00:00:00`)).toISOString()
        : undefined,
      to: filters.to ? endOfDay(parseISO(`${filters.to}T00:00:00`)).toISOString() : undefined,
      projectIds: filters.projectIds.length ? filters.projectIds : undefined,
      categoryIds: filters.categoryIds.length ? filters.categoryIds : undefined,
      tags: filters.tags.length ? filters.tags : undefined,
      minDurationSec: filters.minH > 0 ? filters.minH * 3600 : undefined,
      maxDurationSec: filters.maxH > 0 ? filters.maxH * 3600 : undefined,
      search: filters.q || undefined,
    }),
    [filters],
  );

  const { entries } = useTimeEntries(entryFilters);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const model = useMemo(() => {
    const inputs = entries.map((entry) => {
      const project = entry.projectId ? projectMap.get(entry.projectId) ?? null : null;
      const category = entry.categoryId ? categoryMap.get(entry.categoryId) ?? null : null;

      return {
        id: entry.id,
        title: entry.title,
        startAt: entry.startAt,
        durationSec: entry.durationSec ?? null,
        tags: entry.tags,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        categoryColor: category?.color ?? null,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
      };
    });

    return buildLoggerGraph(inputs, { shape, colorMode, includeTags });
  }, [categoryMap, colorMode, entries, includeTags, projectMap, shape]);

  const entryDates = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry.startAt])),
    [entries],
  );

  const maxHours = useMemo(
    () => model.nodes.reduce((max, node) => Math.max(max, node.hours), 0),
    [model.nodes],
  );

  const canvasNodes = useMemo<CanvasNode[]>(
    () =>
      model.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        color: node.color,
        // Area ∝ hours reads more honestly than radius ∝ hours.
        size: maxHours > 0 ? 5 + Math.sqrt(node.hours / maxHours) * 17 : 6,
      })),
    [maxHours, model.nodes],
  );

  const canvasEdges = useMemo<CanvasEdge[]>(() => {
    const maxEdgeHours = model.edges.reduce((max, edge) => Math.max(max, edge.hours), 0);
    return model.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      weight: maxEdgeHours > 0 ? edge.hours / maxEdgeHours : 0,
    }));
  }, [model.edges]);

  const hovered = hoveredId ? model.nodes.find((node) => node.id === hoveredId) ?? null : null;

  function handleNodeClick(id: string) {
    if (id.startsWith("entry:")) {
      const startAt = entryDates.get(id.slice("entry:".length));
      if (startAt) {
        router.push(`/log?date=${format(new Date(startAt), "yyyy-MM-dd")}`);
      }
      return;
    }

    // Category/project/tag nodes narrow the graph itself rather than navigating.
    if (id.startsWith("category:")) {
      const categoryId = id.slice("category:".length);
      if (categoryMap.has(categoryId)) {
        setFilters((current) => ({
          ...current,
          categoryIds: current.categoryIds.includes(categoryId)
            ? current.categoryIds.filter((value) => value !== categoryId)
            : [...current.categoryIds, categoryId],
        }));
      }
      return;
    }

    if (id.startsWith("project:")) {
      const projectId = id.slice("project:".length);
      if (projectMap.has(projectId)) {
        setFilters((current) => ({
          ...current,
          projectIds: current.projectIds.includes(projectId)
            ? current.projectIds.filter((value) => value !== projectId)
            : [...current.projectIds, projectId],
        }));
      }
      return;
    }

    if (id.startsWith("tag:")) {
      const tag = id.slice("tag:".length);
      setFilters((current) => ({
        ...current,
        tags: current.tags.includes(tag)
          ? current.tags.filter((value) => value !== tag)
          : [...current.tags, tag],
      }));
    }
  }

  return (
    <div className="space-y-3">
      <LogFilters filters={filters} onChange={setFilters} />

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-card",
          GRAPH_FRAME_HEIGHT,
        )}
      >
        {model.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-medium text-foreground">Nothing logged in this range</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Widen the date range or clear filters — the graph draws from your time entries.
            </p>
          </div>
        ) : (
          <>
            <GraphCanvas
              nodes={canvasNodes}
              edges={canvasEdges}
              isDark={isDark}
              onNodeClick={handleNodeClick}
              onNodeHover={setHoveredId}
              forces={forces}
              className="h-full w-full"
            />

            {/* Left rail floats over the canvas, Obsidian-style, so the graph
                keeps the whole frame instead of sitting under a toolbar. */}
            <GraphSideRail width={240}>
              <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/90 p-2 shadow-sm backdrop-blur">
                <ToggleGroup value={shape} options={SHAPES} onChange={setShape} />
                <ToggleGroup value={colorMode} options={COLOR_MODES} onChange={setColorMode} />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIncludeTags((current) => !current)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      includeTags
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Tags {includeTags ? "on" : "off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilters(DEFAULT_LOGGER_FILTERS)}
                    title="Reset to last 30 days"
                    className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Last 30d
                  </button>
                </div>
              </div>

              <GraphLegend
                className="pointer-events-auto"
                title={colorMode === "kind" ? "Node type" : colorMode}
                items={model.groups.map((group) => ({
                  key: group.key,
                  label: group.label,
                  color: group.color,
                  mixed: group.mixed,
                  meta: formatDuration(Math.round(group.hours * 3600)),
                }))}
              />

              <GraphForcesPanel
                className="pointer-events-auto"
                forces={forces}
                onChange={setForces}
              />
            </GraphSideRail>

            {hovered ? (
              <Card className="absolute right-4 top-4 max-w-xs border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: hovered.color }}
                  />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {hovered.kind}
                    </p>
                    <p className="font-semibold text-foreground">{hovered.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDuration(Math.round(hovered.hours * 3600))} ·{" "}
                      {hovered.entryCount} {hovered.entryCount === 1 ? "entry" : "entries"} ·{" "}
                      {hovered.degree} {hovered.degree === 1 ? "link" : "links"}
                    </p>
                    {hovered.kind !== "category" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mostly {hovered.categoryLabel}
                      </p>
                    )}
                    {hovered.kind !== "project" && (
                      <p className="text-xs text-muted-foreground">
                        Mostly {hovered.projectLabel}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

            <div className="pointer-events-none absolute bottom-4 right-4 flex max-w-[60%] flex-col items-end gap-1.5 text-xs text-muted-foreground">
              {colorMode === "kind" && (
                <div className="flex flex-wrap justify-end gap-2.5 rounded-full border border-border/60 bg-card/90 px-3 py-1 shadow-sm backdrop-blur">
                  {Object.entries(LOGGER_KIND_COLORS).map(([kind, color]) => (
                    <span key={kind} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      {kind}
                    </span>
                  ))}
                </div>
              )}
              {shape === "entries" && model.truncatedEntries > 0 ? (
                <span className="rounded-full border border-border/60 bg-card/90 px-3 py-1 text-right shadow-sm backdrop-blur text-amber-600 dark:text-amber-400">
                  {model.truncatedEntries} entries folded into aggregate nodes (cap reached) —
                  narrow the range to see them individually.
                </span>
              ) : null}
              <span className="rounded-full border border-border/60 bg-card/90 px-3 py-1 shadow-sm backdrop-blur">
                {model.entryCount} entries · {formatDuration(Math.round(model.totalHours * 3600))} ·{" "}
                {model.nodes.length} nodes · {model.edges.length} connections
              </span>
              <span className="rounded-full border border-border/60 bg-card/90 px-3 py-1 text-right shadow-sm backdrop-blur">
                Click a category, project, or tag node to toggle it as a filter.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
