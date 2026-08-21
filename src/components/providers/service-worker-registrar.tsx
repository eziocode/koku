"use client";

import { useEffect } from "react";

/** Dev registers a distinct script URL whose fetch handler is a no-op. */
const SCRIPT_URL = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";

/** Don't hammer `update()` when a long-lived tab is focused repeatedly. */
const UPDATE_THROTTLE_MS = 60_000;

/**
 * Registers the service worker (`/sw.js`).
 *
 * Two jobs. First, installability: koku becomes an installable app
 * ("Install app" / "Add to Home Screen") that launches chrome-less in its own
 * window. Second, notifications: action buttons are only available through
 * `ServiceWorkerRegistration.showNotification()`, never the `Notification`
 * constructor, so koku's check-in reminders depend on this registration.
 *
 * Registration used to be skipped outside production to avoid stale-cache pain
 * during HMR. It no longer is, because that made notifications impossible to
 * develop or test locally. Instead the worker itself bypasses all caching in
 * development (see the DEV banner in `public/sw.js`) and only handles
 * notifications there — so HMR stays hot while the notification paths remain
 * exercisable.
 *
 * Fails silently on unsupported browsers: both installability and notifications
 * are progressive enhancements.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let lastUpdateAt = 0;
    let registration: ServiceWorkerRegistration | null = null;

    const checkForUpdate = () => {
      const now = Date.now();
      if (!registration || now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
      lastUpdateAt = now;
      void registration.update().catch(() => undefined);
    };

    const register = () => {
      navigator.serviceWorker
        .register(SCRIPT_URL, { scope: "/", updateViaCache: "none" })
        .then((result) => {
          registration = result;
          lastUpdateAt = Date.now();
          // A tab left open for days would otherwise keep an outdated worker,
          // and with it outdated notification handling.
          window.addEventListener("focus", checkForUpdate);
        })
        .catch(() => {
          /* progressive enhancement — ignore failures */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  return null;
}
