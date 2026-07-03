"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (`/sw.js`) so koku is installable as a
 * standalone app ("Install app" / "Add to Home Screen") — the same
 * chrome-less, own-window experience as native/PWA apps like Spotify.
 *
 * Registration is skipped in development to avoid stale-cache surprises during
 * HMR, and fails silently on unsupported browsers. The SW itself never caches
 * API traffic, so bring-your-own-key AI requests always hit the network.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* installability is progressive enhancement — ignore failures */
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
