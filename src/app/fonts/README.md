# Bundled typefaces

Self-hosted so the app renders identically offline and the first paint makes no
third-party request. Each file is the `latin` or `latin-ext` subset of the
family's variable face, taken from Google Fonts' `css2` API.

| Files | Family | Licence |
| --- | --- | --- |
| `manrope-*` | Manrope | SIL Open Font License 1.1 |
| `inter-*` | Inter | SIL Open Font License 1.1 |
| `geist-*`, `geist-mono-*` | Geist, Geist Mono | SIL Open Font License 1.1 |
| `jakarta-*` | Plus Jakarta Sans | SIL Open Font License 1.1 |
| `dmsans-*` | DM Sans | SIL Open Font License 1.1 |
| `grotesk-*` | Space Grotesk | SIL Open Font License 1.1 |
| `plex-sans-*`, `plex-mono-*` | IBM Plex Sans, IBM Plex Mono | SIL Open Font License 1.1 |
| `source-serif-*` | Source Serif 4 | SIL Open Font License 1.1 |

The OFL permits redistribution and embedding, including in a bundled
application, as long as the licence travels with the fonts — that is what this
file records.

Declared in `src/app/fonts.ts`; selected at runtime by the `data-font`
attribute, whose token mapping lives in `src/app/globals.css`.
