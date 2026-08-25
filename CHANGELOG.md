# Changelog

All notable changes to this project are documented in this file.

## [0.2.1] - 2026-08-25

### Fixed

- Stop treating a missing or still-restoring Zoho session as a cloud-sync failure, preventing repeated “Saved locally” warnings after reloads and ordinary saves.
- Bypass stale browser caching for sync authentication checks and retry a newly restored session quickly.

## [0.2.0] - 2026-08-25

### Added

- Optional Zoho Catalyst sign-in, cross-device sync, conflict handling, presence tracking, and admin user/group management.
- Guided welcome flow, configurable 12-hour or 24-hour time display, and a cached daily sidebar quote.
- Report exports, inline admin reports, smart note filters, lazy lists for large collections, and reusable dashboard controls.

### Changed

- Improved onboarding validation, project/category sync reliability, and admin data freshness.
- Show cloud-sync controls only for signed-in cloud users; hide them in local mode.
- Use Next.js `Script` for pre-paint accent initialization and avoid reading browser origin during server rendering.

### Fixed

- Keep a fallback quote visible if external quote service is unavailable.
- Prevent report date selections beyond today and improve dashboard selected-day loading.

[0.2.0]: https://github.com/eziocode/koku/releases/tag/v0.2.0
[0.2.1]: https://github.com/eziocode/koku/releases/tag/v0.2.1
