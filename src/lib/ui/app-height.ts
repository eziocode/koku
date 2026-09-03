/**
 * Publishing and repairing `--app-height`, the pixel height the whole shell is
 * sized from. See `components/layout/viewport-height.tsx` for why the height is
 * measured in JS at all.
 */

const PROPERTY = "--app-height";

/**
 * Writes the live window height, skipping the write when it would not change.
 *
 * The idempotence is what makes this safe to call from a MutationObserver: a
 * no-op write still dirties the custom property and can feed a mutation loop.
 */
export function measureAppHeight(): void {
  const next = `${window.innerHeight}px`;
  if (document.documentElement.style.getPropertyValue(PROPERTY) === next) {
    return;
  }
  document.documentElement.style.setProperty(PROPERTY, next);
}

/**
 * Re-measures only when the document has actually drifted from the window.
 *
 * The guard is an assertion against reality rather than a guess about which
 * event was missed, so any caller can invoke it as often as it likes: when the
 * layout is already correct this costs one layout read and writes nothing.
 * A drift of one pixel is ignored because `clientHeight` is rounded.
 */
export function repairAppHeightIfStale(): boolean {
  if (Math.abs(document.documentElement.clientHeight - window.innerHeight) <= 1) {
    return false;
  }
  measureAppHeight();
  return true;
}
