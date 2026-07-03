# koku

A **local-first** time tracker, notes workspace, and AI assistant. Track your work, connect your notes into a knowledge graph, and generate stand-ups and monthly reports with the LLM provider of your choice — all with your data stored **in your own browser**.

> **Privacy by design:** your time entries, notes, and settings live in your browser's IndexedDB. Nothing is sent to a server except the AI requests you explicitly trigger, which go directly to the provider using a key you supply.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Architecture & design decisions](#architecture--design-decisions)
- [AI features](#ai-features)
- [Charts & reporting](#charts--reporting)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Features

- **Time tracking** — a live timer plus manual entry logging, organised by project and category, with tags, notes, and start/end times.
- **Daily log** — review, filter, edit, and compare entries by project, category, tag, date range, duration, and free-text search.
- **Dashboard** — weekly overview with **segmented stacked bars** where each work log is its own coloured segment; hover for a rich tooltip, click to jump to that day.
- **Reports** — monthly analytics (segmented daily activity, project breakdown, trend line) with full filtering and CSV/JSON export.
- **Notes** — a TipTap-based editor with wiki-style `[[links]]` and a **knowledge graph** visualising note connections.
- **AI assistant** — bring-your-own-key chat, stand-up generation, and monthly narrative reports across multiple providers.
- **Appearance** — light/dark theme and accent customisation, centralised through a theming layer.

---

## Tech stack

| Layer            | Choice                                                        |
| ---------------- | ------------------------------------------------------------- |
| Framework        | **Next.js 16** (App Router — note the custom conventions below) |
| Language         | TypeScript, React 19                                          |
| Storage          | **Dexie** (IndexedDB) — local-first, no backend database      |
| Data layer       | `dexie-react-hooks` live queries + TanStack Query             |
| Charts           | **Recharts 3** with a centralised chart theme                 |
| Styling          | Tailwind CSS + Radix UI primitives                            |
| Editor           | TipTap                                                        |
| AI               | Vercel AI SDK (`ai` v7) with multiple provider adapters       |

> ⚠️ **This is a modified Next.js build.** APIs, conventions, and file structure differ from stock Next.js. In particular, request middleware lives in **`src/proxy.ts`** (not `middleware.ts`). Before changing framework-level code, read the bundled guides in `node_modules/next/dist/docs/` and heed any deprecation notices.

---

## Requirements

- **Node.js 20+**
- **npm** (the repo ships a `package-lock.json`)
- A modern browser with IndexedDB support (all data persists locally per-browser)

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. (Optional) set up environment variables
cp .env.example .env.local

# 3. Start the dev server
npm run dev
```

Open **http://localhost:3000**. On first launch, koku seeds a local database in your browser — no sign-up or backend required.

> Because storage is per-browser, opening the app in a different browser or a private window starts from an empty workspace. Use **Settings → Storage** to export/import your data.

---

## Configuration

koku runs with **no configuration**. Environment variables are optional and only relevant to specific features. Copy `.env.example` to `.env.local` and set what you need:

| Variable         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `ENCRYPTION_KEY` | Optional key material referenced for encrypting sensitive values.       |
| `AUDIT_LOG`      | Set to opt into audit logging (disabled in production unless enabled).  |

**AI provider keys are _not_ set here.** They are entered in the app under **Settings → AI Keys**, stored in your browser, and sent directly to the provider with each request.

---

## Available scripts

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the development server                       |
| `npm run build`     | Production build                                   |
| `npm run start`     | Serve the production build                         |
| `npm run lint`      | Run ESLint                                         |
| `npm test`          | Run the unit test suite (via `tsx --test`)         |

> If `npm test` cannot resolve `tsx`, run the suite directly with `npx tsx --test src/**/*.test.ts`.

---

## Project structure

```
src/
  app/
    (app)/            # Authenticated app routes: dashboard, log, reports, notes, ai, graph, settings
    api/ai/           # AI route handlers: chat, standup, monthly-report, test
    globals.css       # Theme tokens (CSS variables, light/dark)
  components/
    charts/           # Reusable, theme-aware chart components (see charts/README.md)
    dashboard/         reports/  time-tracker/  notes/  editor/  ai/  graph/
    ui/               # Radix-based design-system primitives
    providers/        # Theme, appearance, query, and app providers
  lib/
    ai/               # Provider adapters, request validation (+ tests)
    charts/           # Pure segment transforms + chart theme (+ tests)
    storage/          # Dexie db, live-query hooks
    stores/  validations/  navigation.ts  export.ts  notes.ts  utils.ts
  proxy.ts            # Request proxy (this build's replacement for middleware)
```

---

## Architecture & design decisions

- **Local-first storage.** All domain data (`TimeEntry`, notes, projects, categories, settings, AI keys) is persisted in IndexedDB via Dexie. UI reads through live-query hooks in `src/lib/storage/hooks/`, so views update reactively as data changes — there is no server database to provision.
- **Separation of concerns for charts.** Chart logic is split into three layers: **pure transforms** (`src/lib/charts/segments.ts`), a **centralised theme** (`src/lib/charts/theme.ts`), and **presentational components** (`src/components/charts/`). Transforms are unit-tested and framework-agnostic.
- **Centralised theming.** Colours come from CSS variables in `globals.css` and the chart theme module, so components never hardcode hex values and every chart follows light/dark mode. Project colours are deterministically derived so a project keeps the same colour across all charts.
- **Bring-your-own-key AI.** API routes forward a user-supplied key to the chosen provider. Request bodies are validated and size-limited in `src/lib/ai/request-validation.ts`, and the audit logger redacts secrets.
- **Custom framework conventions.** Because this Next.js build has breaking changes, framework-level files (route handlers, `proxy.ts`) follow the bundled docs rather than stock conventions.

---

## AI features

koku supports multiple LLM providers via a **bring-your-own-key** model:

1. Go to **Settings → AI Keys** and add a key for your provider (e.g. OpenAI, Groq, GitHub Models).
2. Use the **AI** workspace to:
   - **Chat** with your notes and logged work as context.
   - Generate a **stand-up** summary from recent entries.
   - Generate a **monthly narrative** report.

Keys are stored in your browser and sent directly to the provider on each request. Requests are validated and size-capped server-side; secrets are never written to logs.

---

## Charts & reporting

The dashboard and reports use a reusable, accessible segmented-bar system. Each day is a **stacked bar** whose segments represent individual work logs (segment height ∝ duration). Hovering shows a rich tooltip (title, description, project, start/end, duration, tags); clicking navigates to that day's log.

Reports support filtering by **project, category, tag, date range, and free-text search**, and export to **CSV/JSON**. Charts are lazy-loaded and memoised for performance.

See **[`src/components/charts/README.md`](src/components/charts/README.md)** for the component API, theming details, and accessibility notes.

---

## Testing

Unit tests cover the pure, framework-agnostic logic — chart segment transforms and AI request validation:

```bash
npm test
# or, if tsx is not resolved:
npx tsx --test src/lib/charts/segments.test.ts src/lib/ai/request-validation.test.ts
```

When adding logic to transforms or validation, add a matching `*.test.ts` alongside the source file.

---

## Troubleshooting

**My data disappeared / the app is empty.**
Data is stored per-browser in IndexedDB. Switching browsers, clearing site data, or using a private window starts fresh. Use **Settings → Storage** to export a backup and re-import it.

**AI requests fail with a 4xx/5xx error.**
- Confirm you added a valid key under **Settings → AI Keys** for the selected provider.
- Some providers deprecate models — if a request fails, verify the configured model is still available for your provider/plan.
- Errors returned by the route are surfaced in the UI; check the message for provider-specific guidance.

**The date-range filter in Reports seems ignored.**
The report range is the intersection of the selected **month** and any explicit **date range** filter. If the range falls outside the selected month, no entries match — widen the month or clear the range.

**Charts look empty or show `NaN`.**
A malformed `?month=` URL parameter falls back to the current month. If a chart is still empty, confirm entries exist within the active filters/range.

**`npm test` fails to find `tsx`.**
Run the suite with `npx tsx --test <files>` (see [Testing](#testing)).

**Editing framework/route code causes unexpected errors.**
This is a modified Next.js build. Read `node_modules/next/dist/docs/` for the correct conventions (e.g. middleware lives in `src/proxy.ts`) before changing framework-level files.

---

## Contributing

- Follow the existing modular architecture: keep transforms pure and tested, keep components presentational and reusable, and route theming through the centralised theme layer.
- Run `npm run lint` and `npm test` before opening a PR.
- Respect the custom Next.js conventions documented in `AGENTS.md`.
