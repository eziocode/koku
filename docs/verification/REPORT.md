# Verification report

Environment: Apple M4 Pro, 24 GiB, darwin arm64, Chrome 152.0.7977.83, Next 16.2.9 production build served by `.next/standalone/appsail-server.cjs`.

## Status of plan items

| Item | Status | Evidence |
| --- | --- | --- |
| Standalone preparation script shared with packaging; entry point path fixed; port handling and env exclusions preserved | verified | `scripts/prepare-appsail.mjs`, `scripts/package-appsail.mjs`, `npm run test:tooling` (1 test), packaging smoke below |
| Test runner switched to `node --import tsx --test` | verified | `npm test` runs 526 tests |
| Note metadata store (additive Dexie v11 migration), maintained at the storage boundary | verified | `src/lib/storage/note-metadata.ts`, `note-metadata.test.ts` (7 tests incl. migration backfill, quota abort, restore rebuild) |
| Action-only `useNotes` subscriptions replaced with `noteActions` / metadata hooks | verified | `command-palette.tsx`, `koku-ai-panel.tsx`, `knowledge-graph.tsx`, `ai-workspace.tsx` |
| Notes browsing: windowed rows, preserved search/filters/sorting/modes/personal isolation, single-pass tag counts | verified | `virtual-notes.tsx`, `notes-browser.tsx`, `tests/browser/notes.spec.ts` (4 tests) |
| Graph animation stops when hidden or offscreen and resumes one loop | verified | `graph-canvas.tsx` (IntersectionObserver + `visibilitychange`, single `frameRef`) |
| Narrowed timer-store subscriptions; clock ticks isolated from page calculations | verified | selector-based `useTimerStore` in dashboard, quick capture, palette, routines, timer |
| Deferred loading of heavy client work | verified | `docs/verification/route-chunks.json`; recharts now loads only on `/reports`; tiptap, jspdf, papaparse, ical, AI SDK load on demand; guarded by `tests/browser/bundle.spec.ts` |
| Safety: drafts, outbox, completions, v3 backups, snapshots, atomic replacement; recovered timer payload validated before restore | verified | `backup.test.ts`, `note-saves.test.ts`, `recovery-races.test.ts`, `stop-timer-storage.test.ts`, `recovered-timer.ts` + `parseBackup` schema |
| UI: only verified defects fixed, current font/theme work preserved | verified | narrow-width overflow fixes in `log-client.tsx`, `timer.tsx`, `appearance-settings.tsx`, `storage-settings-manager.tsx`, `notes-browser.tsx`; `tests/browser/layout.spec.ts` passes at 1440/1024/390 px, light and dark, 1x and 200% zoom |
| Playwright harness with synthetic data and mocked cloud/AI | verified | `tests/browser/workspace.ts` seeds an isolated context; all `/api/**` responses are fixtures; no personal workspace touched |
| Dependency audit | pending decision | `npm audit --audit-level=high` reports 41 pre-existing advisories (1 critical, 7 high). Non-major fix available: Next 16.2.9 to 16.3.4 (also clears bundled sharp/postcss). Not applied: a framework bump is outside this plan's scope |

## Performance, 11,000-note workspace, five runs

p95, production build, warm route:

| Interaction | Before | After |
| --- | --- | --- |
| Title/tag search (`searchMs`) | 509 ms | 14 ms |
| Clearing search (`clearMs`) | 7,745 ms | 20 ms |
| `/notes` route readiness (`routeMs`) | 12,687 ms | 206 ms |

Targets met: p95 interactions under 200 ms, warm core-route readiness under one second. Raw samples: `notes-before.json`, `notes-after.json`.

## Bundle

Total client JS in `.next/static`: 4,461,570 B raw / 1,380,955 B gzip before, 4,791,153 B raw / 1,430,086 B gzip after. The total grew because the routes that need charts now fetch them as separate chunks; per-route eager cost fell:

| Route | Eager transfer before | After |
| --- | --- | --- |
| `/dashboard` | 704 kB | 312 kB |
| `/log` | 462 kB | 332 kB |
| `/notes` | 204 kB | 188 kB |
| `/graph` | 399 kB | 340 kB |
| `/reports` | 602 kB | 617 kB (charts render immediately) |

Per-route detail, including which heavy libraries each route loads: `route-chunks.json`.

## Suites run

- `npm test`: 526 passed.
- `npm run test:tooling`: 1 passed.
- `npx playwright test`: 12 passed (bundle, layout at three widths in both themes, notes regressions, benchmark).
- `npm run lint`, `npx tsc --noEmit`: clean.
- `npm run build`: succeeded, standalone assets prepared.
- `npm run audit:security`, `npm run audit:performance`: passed.
- Packaging smoke: `node scripts/package-appsail.mjs` produced a 22.1 MB zip containing `appsail-server.cjs`, `app-config.json`, `server.js`, `.next/static`, and `public`, with no `.env` files; the zip was deleted afterwards.

## Notes

- `npm run audit:deps` fails in this environment with `EALLOWSCRIPTS` because the user-level `~/.npmrc` sets `allow-scripts`. The audit was run as `npm audit --audit-level=high --userconfig /dev/null`.
- `playwright.config.ts` honours `PLAYWRIGHT_EXECUTABLE_PATH` (local Chrome, no Playwright browser download) and `PLAYWRIGHT_REUSE_SERVER=1` for iterating against a running dev server.
- No deployment was performed; public routes and the cloud wire format are unchanged.
