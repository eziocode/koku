"use client";

import { openMiniPlayerWindow } from "@/lib/mini-player/window-controller";

/**
 * Opening the mini player without a click.
 *
 * The Document PiP API normally demands transient user activation, which is why
 * `autoOpenOnStart` hangs off the Start button. Leaving the tab is the other
 * moment the window is genuinely wanted, and there is no click there at all.
 *
 * Chromium's answer is Auto Picture-in-Picture: register the media-session
 * `enterpictureinpicture` action and the browser itself invokes it when the tab
 * is hidden, with activation it grants on our behalf. Two things gate it, and
 * neither is something koku can assert from script — the action handler must be
 * registered *before* the tab hides, and the auto-picture-in-picture content
 * setting must be granted (Chromium grants it to installed PWAs, which is why
 * koku ships a manifest).
 *
 * Where that gate is closed, the `visibilitychange` fallback still tries, and is
 * expected to be refused with `NotAllowedError`. That refusal is why every call
 * from here passes `silent: true`: nobody clicked, so nobody should see a toast.
 */

/**
 * `MediaSessionAction` is a closed union in the DOM lib and Chromium's
 * `"enterpictureinpicture"` is not in it. It is a type alias, so it cannot be
 * augmented — hence a narrow local view of the one method we call, rather than a
 * cast at each call site.
 */
type AutoPipSession = {
  setActionHandler: (action: "enterpictureinpicture", handler: (() => void) | null) => void;
};

function mediaSession(): AutoPipSession | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return null;
  }

  return navigator.mediaSession as unknown as AutoPipSession;
}

/**
 * Arms automatic opening. Returns a disarm function.
 *
 * `shouldOpen` is read at fire time rather than captured, so the decision uses
 * live timer state instead of whatever was true when the listener was bound —
 * that is what keeps an idle mini player from ever popping up.
 */
export function armAutoOpen(shouldOpen: () => boolean): () => void {
  const session = mediaSession();
  const open = () => {
    if (!shouldOpen()) {
      return;
    }

    void openMiniPlayerWindow({ silent: true });
  };

  if (session) {
    try {
      session.setActionHandler("enterpictureinpicture", open);
    } catch {
      /* Action unknown to this browser; the visibility fallback covers it. */
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      open();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);

    if (session) {
      try {
        session.setActionHandler("enterpictureinpicture", null);
      } catch {
        /* Never registered. */
      }
    }
  };
}
