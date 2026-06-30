"use client";

import { Filter, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

export interface LogFilterState {
  from: string;
  to: string;
  projectIds: string[];
  categoryIds: string[];
  tags: string[];
  minH: number;
  maxH: number;
  q: string;
}

export const DEFAULT_FILTERS: LogFilterState = {
  from: "",
  to: "",
  projectIds: [],
  categoryIds: [],
  tags: [],
  minH: 0,
  maxH: 0,
  q: "",
};

function activeFilterCount(f: LogFilterState): number {
  let n = 0;
  if (f.from || f.to) n++;
  if (f.projectIds.length) n++;
  if (f.categoryIds.length) n++;
  if (f.tags.length) n++;
  if (f.minH > 0 || f.maxH > 0) n++;
  if (f.q.trim()) n++;
  return n;
}

interface LogFiltersProps {
  filters: LogFilterState;
  onChange: (next: LogFilterState) => void;
}

export function LogFilters({ filters, onChange }: LogFiltersProps) {
  const [open, setOpen] = useState(false);
  const { projects } = useProjects();
  const { categories } = useCategories();

  const { entries: allEntries } = useTimeEntries();
  const allTags = useMemo(
    () => Array.from(new Set(allEntries.flatMap((e) => e.tags))).sort(),
    [allEntries],
  );

  const count = activeFilterCount(filters);

  function toggle(field: "projectIds" | "categoryIds" | "tags", value: string) {
    const current = filters[field] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [field]: next });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          variant={count > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {count > 0 && (
            <Badge className="ml-1 rounded-full px-2 py-0.5 text-xs">{count}</Badge>
          )}
        </Button>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {open && (
        <Card>
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 xl:grid-cols-3">
            {/* Date range */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Date range
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                  value={filters.from}
                  onChange={(d) => onChange({ ...filters, from: d })}
                  placeholder="From"
                  className="flex-1 text-sm"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <DatePicker
                  value={filters.to}
                  onChange={(d) => onChange({ ...filters, to: d })}
                  placeholder="To"
                  className="flex-1 text-sm"
                />
              </div>
            </div>

            {/* Project multi-select */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Projects
              </Label>
              <div className="flex flex-wrap gap-2">
                {projects.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No projects</span>
                ) : projects.map((project) => {
                  const active = filters.projectIds.includes(project.id);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => toggle("projectIds", project.id)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      {project.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category multi-select */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Categories
              </Label>
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No categories</span>
                ) : categories.map((cat) => {
                  const active = filters.categoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggle("categoryIds", cat.id)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags
                </Label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = filters.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggle("tags", tag)}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                        ].join(" ")}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Duration min/max */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Duration (hours)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  placeholder="Min"
                  value={filters.minH || ""}
                  onChange={(e) =>
                    onChange({ ...filters, minH: e.target.value ? Number(e.target.value) : 0 })
                  }
                  className="text-sm"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  placeholder="Max"
                  value={filters.maxH || ""}
                  onChange={(e) =>
                    onChange({ ...filters, maxH: e.target.value ? Number(e.target.value) : 0 })
                  }
                  className="text-sm"
                />
              </div>
            </div>

            {/* Text search */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Search
              </Label>
              <Input
                placeholder="Title, notes, tags…"
                value={filters.q}
                onChange={(e) => onChange({ ...filters, q: e.target.value })}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
