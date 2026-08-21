"use client";

import { PictureInPicture2 } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  detectMiniPlayerCapabilities,
  isMiniPlayerSupported,
} from "@/lib/mini-player/feature-detection";
import { useMiniPlayerOwnership } from "@/lib/mini-player/ownership";
import {
  closeMiniPlayerWindow,
  getMiniPlayerServerState,
  getMiniPlayerWindowState,
  openMiniPlayerWindow,
  subscribeMiniPlayerWindow,
} from "@/lib/mini-player/window-controller";
import { useMiniPlayerPreferences } from "@/lib/notifications/use-notification-preferences";

/* Capability is read once per module load rather than per render; it cannot
   change during a session. Guarded for SSR by the detector itself. */
let cachedSupported: boolean | null = null;

function supported() {
  if (cachedSupported === null) {
    cachedSupported = isMiniPlayerSupported(detectMiniPlayerCapabilities());
  }

  return cachedSupported;
}

const supportListeners = new Set<() => void>();

function subscribeSupport(listener: () => void) {
  supportListeners.add(listener);
  return () => supportListeners.delete(listener);
}

interface PopOutButtonProps {
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

/**
 * Opens the floating mini player.
 *
 * Hidden entirely — not disabled — where Document PiP is unavailable. A
 * permanently greyed control with no explanation is worse than no control; the
 * settings page carries the explanation for anyone who goes looking.
 */
export function PopOutButton({ variant = "outline", className }: PopOutButtonProps) {
  const { prefs } = useMiniPlayerPreferences();
  const ownership = useMiniPlayerOwnership();
  const isSupported = useSyncExternalStore(
    subscribeSupport,
    supported,
    () => false,
  );
  const windowState = useSyncExternalStore(
    subscribeMiniPlayerWindow,
    getMiniPlayerWindowState,
    getMiniPlayerServerState,
  );

  if (!prefs.enabled || !isSupported) {
    return null;
  }

  const isOwner = ownership === "owner";
  const isOpen = windowState.status === "open";

  return (
    <Button
      variant={variant}
      className={className}
      disabled={!isOwner}
      aria-label={isOpen ? "Close mini player" : "Open mini player"}
      onClick={async () => {
        if (isOpen) {
          closeMiniPlayerWindow();
          return;
        }

        // Called straight from the click so the user activation is still valid.
        const next = await openMiniPlayerWindow();
        if (next.status === "error") {
          toast.error(
            next.reason === "no-user-activation"
              ? "Your browser wouldn’t open the mini player just then. Try clicking again."
              : "Couldn’t open the mini player.",
          );
        }
      }}
    >
      <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
      {isOpen ? "Close mini player" : "Mini player"}
      {!isOwner ? <span className="sr-only">Open in another koku tab</span> : null}
    </Button>
  );
}
