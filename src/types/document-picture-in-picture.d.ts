/**
 * Ambient types for the Document Picture-in-Picture API.
 *
 * TypeScript 5.9's `lib.dom.d.ts` has no declarations for this API at all, so
 * koku's floating mini player (`src/lib/mini-player/`) would otherwise have to
 * be written entirely through casts.
 *
 * The API is Chromium-only (Chrome/Edge 116+), which is why `documentPictureInPicture`
 * is declared optional on `Window` — every access must be feature-detected. See
 * `src/lib/mini-player/feature-detection.ts`.
 *
 * Spec: https://wicg.github.io/document-picture-in-picture/
 */
interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  /** Hides the "back to tab" button in the PiP window chrome. */
  disallowReturnToOpener?: boolean;
  /** Opens at the default placement rather than restoring the last position. */
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPictureEvent extends Event {
  readonly window: Window;
}

interface DocumentPictureInPictureEventMap {
  enter: DocumentPictureInPictureEvent;
}

interface DocumentPictureInPicture extends EventTarget {
  /** The open PiP window, or `null` when none is open. */
  readonly window: Window | null;
  /**
   * Opens the PiP window. Requires transient user activation, so it must be
   * called synchronously from a user gesture — never from an effect.
   */
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  onenter:
    | ((this: DocumentPictureInPicture, ev: DocumentPictureInPictureEvent) => void)
    | null;
  addEventListener<K extends keyof DocumentPictureInPictureEventMap>(
    type: K,
    listener: (
      this: DocumentPictureInPicture,
      ev: DocumentPictureInPictureEventMap[K],
    ) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof DocumentPictureInPictureEventMap>(
    type: K,
    listener: (
      this: DocumentPictureInPicture,
      ev: DocumentPictureInPictureEventMap[K],
    ) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface Window {
  /** Chromium-only. Always feature-detect before use. */
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}
