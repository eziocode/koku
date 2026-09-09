"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { filterByQuery } from "@/lib/search/match";
import {
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  SETTINGS_SECTIONS_BY_ID,
  settingHref,
  type SettingsEntry,
  type SettingsSectionMeta,
} from "@/lib/settings/registry";

const MAX_RESULTS = 12;

/**
 * `"notifications"` narrows to that hub's sections and their controls, so the
 * notifications page does not offer results it cannot show.
 */
type Scope = "all" | "notifications";

/** A section card and a single control, flattened into one result list. */
type Result =
  | { type: "section"; section: SettingsSectionMeta }
  | { type: "entry"; entry: SettingsEntry; section: SettingsSectionMeta };

function resultsForScope(scope: Scope): Result[] {
  const sections =
    scope === "all"
      ? [...SETTINGS_SECTIONS]
      : SETTINGS_SECTIONS.filter(
          (section) => section.hub === "notifications" || section.id === "notifications",
        );
  const sectionIds = new Set(sections.map((section) => section.id));

  return [
    ...sections.map((section): Result => ({ type: "section", section })),
    ...SETTINGS_ENTRIES.filter((entry) => sectionIds.has(entry.sectionId)).map(
      (entry): Result => ({
        type: "entry",
        entry,
        section: SETTINGS_SECTIONS_BY_ID[entry.sectionId],
      }),
    ),
  ];
}

function resultLabel(result: Result): string {
  return result.type === "section" ? result.section.title : result.entry.label;
}

function resultDescription(result: Result): string {
  return result.type === "section" ? result.section.description : result.entry.description;
}

function resultHref(result: Result): string {
  return result.type === "section" ? result.section.href : settingHref(result.entry);
}

/**
 * Descriptions are deliberately excluded. They are long prose, and
 * `matchRank`'s subsequence tier will match almost any query against a long
 * enough string — so indexing them made every verbose setting a hit for
 * everything. Synonyms belong in `keywords`, where they are chosen.
 */
function resultKeywords(result: Result): string[] {
  const shared = result.type === "section" ? [] : [result.section.title];
  const own = result.type === "section" ? result.section.keywords : result.entry.keywords;
  return [...shared, ...(own ?? [])];
}

/**
 * Search over the settings registry. Results are a flat list rather than
 * filtered section cards, because the point is finding one control and a card
 * cannot show which of its controls matched.
 *
 * `children` is the section grid, rendered untouched while the query is empty.
 */
export function SettingsSearch({
  scope = "all",
  children,
}: {
  scope?: Scope;
  children: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const pool = React.useMemo(() => resultsForScope(scope), [scope]);

  const matches = React.useMemo(
    () => filterByQuery(pool, query, resultLabel, resultKeywords),
    [pool, query],
  );

  const trimmed = query.trim();
  const shown = matches.slice(0, MAX_RESULTS);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="pl-9"
        />
      </div>

      {trimmed.length === 0 ? (
        children
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches “{trimmed}”. Try a different word, or browse the sections below.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((result) => {
            const isSection = result.type === "section";
            return (
              <Link
                key={isSection ? `section:${result.section.id}` : `entry:${result.entry.anchorId}`}
                href={resultHref(result)}
                className="block rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <p className="text-xs text-muted-foreground">
                  {isSection ? "Section" : result.section.title}
                </p>
                <p className="mt-0.5 text-sm font-medium">{resultLabel(result)}</p>
                {resultDescription(result).length > 0 ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {resultDescription(result)}
                  </p>
                ) : null}
              </Link>
            );
          })}
          {matches.length > shown.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {shown.length} of {matches.length} matches. Keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
