"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleRow } from "@/components/settings/toggle-row";
import { applyAccentToDocument, cacheAccent, isValidAccent } from "@/lib/appearance";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { cn } from "@/lib/utils";
import { TIME_FORMATS } from "@/lib/time-format";

const THEMES = [
  { key: "light",  label: "Light",  Icon: Sun },
  { key: "system", label: "System", Icon: Monitor },
  { key: "dark",   label: "Dark",   Icon: Moon },
] as const;

const ACCENT_PALETTES = [
  { key: "teal",       label: "Teal",       color: "#0d6e64" },
  { key: "ocean",      label: "Ocean",      color: "#1a5f8a" },
  { key: "forest",     label: "Forest",     color: "#1f6b3b" },
  { key: "lavender",   label: "Lavender",   color: "#5a3da8" },
  { key: "amber",      label: "Amber",      color: "#9a5c0a" },
  { key: "slate",      label: "Slate",      color: "#354f6b" },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { value: currentAccent, setValue } = useTypedSetting("accent");
  const { value: timeFormat, setValue: setTimeFormat } = useTypedSetting("timeFormat");
  const { value: entryNotesDisplay, setValue: setEntryNotesDisplay } = useTypedSetting("entryNotesDisplay");

  return (
    <div className="space-y-6">
      {/* ── Theme selector ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose how Koku looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme selection">
            {THEMES.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={theme === key}
                onClick={() => setTheme(key)}
                className={cn(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  theme === key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time format</CardTitle>
          <CardDescription>Use 12-hour or 24-hour time across Koku.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2" role="radiogroup" aria-label="Time format selection">
            {TIME_FORMATS.map((format) => (
              <button
                key={format}
                type="button"
                role="radio"
                aria-checked={timeFormat === format}
                onClick={() => void setTimeFormat(format)}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  timeFormat === format
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {format === "12h" ? "12-hour" : "24-hour"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entry notes</CardTitle>
          <CardDescription>Choose how notes on time entries show up on the dashboard and log page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            id="entry-notes-display"
            label="Show notes by default"
            description="Off shows a note count you expand on demand, instead of the full text."
            checked={entryNotesDisplay === "always"}
            onCheckedChange={(checked) => void setEntryNotesDisplay(checked ? "always" : "on-demand")}
          />
        </CardContent>
      </Card>

      {/* ── Accent colour selector ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Accent colour</CardTitle>
          <CardDescription>
            Sets the primary interactive colour across the whole app. Saved locally on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid grid-cols-3 gap-3 sm:grid-cols-6"
            role="radiogroup"
            aria-label="Accent colour selection"
          >
            {ACCENT_PALETTES.map(({ key, label, color }) => {
              const selected = currentAccent === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${label} accent colour`}
                  title={label}
                  onClick={() => {
                    if (isValidAccent(key)) {
                      // Apply + warm the pre-paint cache immediately so both the
                      // current view and the next hard refresh are flash-free,
                      // then persist to Dexie (the source of truth).
                      applyAccentToDocument(key);
                      cacheAccent(key);
                    }
                    void setValue(key);
                  }}
                  className={cn(
                    "flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all",
                    selected
                      ? "border-foreground/25 bg-muted shadow-sm"
                      : "border-border/70 hover:border-border hover:bg-muted/50",
                  )}
                >
                  {/* Colour swatch */}
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-black/10"
                    style={{ background: color }}
                    aria-hidden="true"
                  >
                    {selected && (
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="h-4 w-4 text-white"
                        aria-hidden="true"
                      >
                        <path d="M6.5 11.5 3 8l1.4-1.4 2.1 2.1 4.1-4.1L12 6z" />
                      </svg>
                    )}
                  </span>
                  <span className="text-foreground">{label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
