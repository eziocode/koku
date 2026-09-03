/**
 * Whether any overlay layer is live, read straight off the DOM.
 *
 * Shared by `<OverlayResidueGuard />` and the global hotkey dispatcher so the
 * two can never disagree about what "a modal is open" means.
 *
 * The selectors below are the ones Radix actually emits, verified against the
 * installed packages rather than inferred:
 *
 * - `DialogContent` renders `role="dialog"` plus `data-state`. The overlay
 *   carries `data-state` but no role, so it is matched via its content sibling.
 * - Popper-based content (Select, Popover, DropdownMenu) puts
 *   `data-radix-popper-content-wrapper` on the *wrapper*, which has no
 *   `data-state`; the state lives on the element inside it.
 * - `[data-radix-portal]` is deliberately absent: `@radix-ui/react-portal` 1.1.x
 *   renders a bare div with no marker at all, so a selector for it matches
 *   nothing.
 * - `body[data-scroll-locked]` is deliberately absent too. It is one of the
 *   things the guard repairs, so letting it gate the repair is exactly the
 *   circular failure that used to wedge every keyboard shortcut.
 * - A bare `[data-state]` is far too broad: Tabs, Accordion and Switch all use it.
 */

/** The app's own non-Radix layers opt in with this, so they are visible here too. */
const KOKU_OVERLAY = "[data-koku-overlay='open']";

export const OPEN_LAYER_SELECTOR = [
  "[role='dialog'][data-state='open']",
  "[data-radix-popper-content-wrapper] [data-state='open']",
  KOKU_OVERLAY,
].join(",");

/**
 * Layers that have been dismissed but are still mounted while an exit animation
 * plays (`ui/select.tsx` is the one place in this app with a closing animation,
 * so Radix's `Presence` keeps its node around for a beat).
 */
export const CLOSING_LAYER_SELECTOR = [
  "[role='dialog'][data-state='closed']",
  "[data-radix-popper-content-wrapper] [data-state='closed']",
].join(",");

export function hasOpenOverlay(): boolean {
  return document.querySelector(OPEN_LAYER_SELECTOR) !== null;
}

/**
 * True only when nothing is open *and* nothing is mid-exit.
 *
 * This is the gate for any repair that writes to `<body>`: Radix restores the
 * body's own state asynchronously, so touching it while a layer is still
 * settling would fight that restore instead of cleaning up after it.
 */
export function hasSettledOverlays(): boolean {
  return !hasOpenOverlay() && document.querySelector(CLOSING_LAYER_SELECTOR) === null;
}
