"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleRow } from "@/components/settings/toggle-row";
import {
  applyAccentToDocument,
  applyFontToDocument,
  applySurfaceToDocument,
  cacheAccent,
  cacheFont,
  cacheSurface,
  isValidAccent,
  isValidFont,
  isValidSurface,
} from "@/lib/appearance";
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

/**
 * Neutral palette for each surface style, in both modes. The swatches preview
 * the page/card/border step a style actually paints, which is the thing the
 * choice is about — the accent stays whatever the user picked below.
 */
const SURFACE_STYLES = [
  {
    key: "warm",
    label: "Warm",
    description: "Warm off-white and near-black",
    light: { page: "#fbfaf8", card: "#ffffff", border: "#e5ddd4" },
    dark: { page: "#0d0c0b", card: "#1b1917", border: "#35302b" },
  },
  {
    key: "cool",
    label: "Cool",
    description: "Mist and blue-gray",
    light: { page: "#f5f7f9", card: "#ffffff", border: "#dce3e8" },
    dark: { page: "#0a1017", card: "#18242f", border: "#2f3f4f" },
  },
  {
    key: "neutral",
    label: "Graphite",
    description: "Hueless greys",
    light: { page: "#f6f6f7", card: "#ffffff", border: "#e0e0e4" },
    dark: { page: "#0b0b0c", card: "#1a1a1c", border: "#333338" },
  },
  {
    key: "contrast",
    label: "Contrast",
    description: "Pure white and true black",
    light: { page: "#ffffff", card: "#ffffff", border: "#c9c9cf" },
    dark: { page: "#000000", card: "#141416", border: "#2b2b30" },
  },
] as const;

/**
 * `sample` names the CSS variable the preview renders in, so the button shows
 * the actual bundled face rather than a description of it. Only the selected
 * style's font file is ever downloaded, so these previews fall back to the
 * system stack until a style is chosen — the tradeoff for not fetching nine
 * families on the chance someone opens this page.
 */
const FONT_STYLES = [
  { key: "manrope", label: "Manrope", description: "Brand headings, system body", sample: "var(--font-manrope)" },
  { key: "inter", label: "Inter", description: "Neutral UI throughout", sample: "var(--font-inter)" },
  { key: "geist", label: "Geist", description: "Modern, with matching mono", sample: "var(--font-geist)" },
  { key: "jakarta", label: "Plus Jakarta", description: "Rounded geometric", sample: "var(--font-jakarta)" },
  { key: "dmsans", label: "DM Sans", description: "Clean and compact", sample: "var(--font-dmsans)" },
  { key: "grotesk", label: "Space Grotesk", description: "Grotesque headings", sample: "var(--font-grotesk)" },
  { key: "plex", label: "IBM Plex", description: "Technical, with Plex Mono", sample: "var(--font-plex-sans)" },
  { key: "serif", label: "Source Serif", description: "Editorial headings", sample: "var(--font-source-serif)" },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { value: currentAccent, setValue } = useTypedSetting("accent");
  const { value: currentSurface, setValue: setSurface } = useTypedSetting("surface");
  const { value: currentFont, setValue: setFont } = useTypedSetting("fontStyle");
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
          <div
            id="appearance-theme"
            data-setting-row
            className="flex gap-2"
            role="radiogroup"
            aria-label="Theme selection"
          >
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
          <div
            id="appearance-time-format"
            data-setting-row
            className="flex gap-2"
            role="radiogroup"
            aria-label="Time format selection"
          >
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
            settingId="entry-notes-display"
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
            id="appearance-accent"
            data-setting-row
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

      {/* ── Surface style selector ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Surface style</CardTitle>
          <CardDescription>
            Sets the page and panel colours. One choice covers both light and dark.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="appearance-surface"
            data-setting-row
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            role="radiogroup"
            aria-label="Surface style selection"
          >
            {SURFACE_STYLES.map(({ key, label, description, light, dark }) => {
              const selected = currentSurface === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${label} surface style: ${description}`}
                  onClick={() => {
                    if (isValidSurface(key)) {
                      // Same order as the accent picker: apply, warm the
                      // pre-paint cache, then persist to Dexie.
                      applySurfaceToDocument(key);
                      cacheSurface(key);
                    }
                    void setSurface(key);
                  }}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left text-xs font-medium transition-all",
                    selected
                      ? "border-foreground/25 bg-muted shadow-sm"
                      : "border-border/70 hover:border-border hover:bg-muted/50",
                  )}
                >
                  <span className="flex gap-1.5" aria-hidden="true">
                    {[light, dark].map((mode, index) => (
                      <span
                        key={index}
                        className="flex h-9 flex-1 items-center justify-center rounded-lg border"
                        style={{ background: mode.page, borderColor: mode.border }}
                      >
                        <span
                          className="h-4 w-3/4 rounded-sm border"
                          style={{ background: mode.card, borderColor: mode.border }}
                        />
                      </span>
                    ))}
                  </span>
                  <span className="text-foreground">{label}</span>
                  <span className="font-normal text-muted-foreground">{description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Font style selector ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Font style</CardTitle>
          <CardDescription>
            Sets the typefaces for headings, body text, and timer digits. All are bundled with the app, so they work
            offline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="appearance-font"
            data-setting-row
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            role="radiogroup"
            aria-label="Font style selection"
          >
            {FONT_STYLES.map(({ key, label, description, sample }) => {
              const selected = currentFont === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${label} font style: ${description}`}
                  onClick={() => {
                    if (isValidFont(key)) {
                      applyFontToDocument(key);
                      cacheFont(key);
                    }
                    void setFont(key);
                  }}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left text-xs font-medium transition-all",
                    selected
                      ? "border-foreground/25 bg-muted shadow-sm"
                      : "border-border/70 hover:border-border hover:bg-muted/50",
                  )}
                >
                  <span
                    className="text-2xl leading-tight text-foreground"
                    style={{ fontFamily: `${sample}, var(--font-system-sans)` }}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span className="text-foreground">{label}</span>
                  <span className="font-normal text-muted-foreground">{description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
