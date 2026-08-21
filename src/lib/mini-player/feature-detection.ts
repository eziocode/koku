/**
 * Capability probing for the floating mini player.
 *
 * Never a user-agent sniff: the Document Picture-in-Picture API is Chromium-only
 * today, but that will change, and feature detection means koku picks it up for
 * free rather than needing a browser-list update.
 */

export interface MiniPlayerCapabilities {
  documentPictureInPicture: boolean;
  broadcastChannel: boolean;
  webLocks: boolean;
}

type DetectScope = {
  documentPictureInPicture?: unknown;
  BroadcastChannel?: unknown;
  navigator?: { locks?: unknown };
};

export function detectMiniPlayerCapabilities(
  scope: DetectScope | undefined = typeof window === "undefined" ? undefined : window,
): MiniPlayerCapabilities {
  if (!scope) {
    return { documentPictureInPicture: false, broadcastChannel: false, webLocks: false };
  }

  const pip = scope.documentPictureInPicture;

  return {
    documentPictureInPicture:
      typeof pip === "object" &&
      pip !== null &&
      typeof (pip as { requestWindow?: unknown }).requestWindow === "function",
    broadcastChannel: typeof scope.BroadcastChannel === "function",
    webLocks: typeof scope.navigator?.locks === "object" && scope.navigator?.locks !== null,
  };
}

/** Only the PiP API is load-bearing; the others gate fallbacks, not the feature. */
export function isMiniPlayerSupported(capabilities: MiniPlayerCapabilities): boolean {
  return capabilities.documentPictureInPicture;
}
