"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  INTENT_PARAM,
  isNotificationIntent,
  type NotificationIntent,
} from "@/lib/notifications/messages";

interface NotificationIntentReaderProps {
  onIntent: (intent: NotificationIntent) => void;
}

/**
 * Reads a notification intent out of the URL, acts on it once, then strips it.
 *
 * This exists as its own component purely because of `useSearchParams`: it opts
 * the subtree out of static prerendering, and without a `Suspense` boundary
 * around it `next build` fails with "useSearchParams() should be wrapped in a
 * suspense boundary". Keeping it separate confines that cost to a component that
 * renders nothing.
 *
 * The URL path exists because when no koku window is open, the service worker has
 * to `openWindow` — and a brand-new document has no message listener at the
 * moment the worker would post to it, so the intent has to survive the navigation.
 */
export function NotificationIntentReader({ onIntent }: NotificationIntentReaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intentParam = searchParams.get(INTENT_PARAM);

  useEffect(() => {
    if (!intentParam) {
      return;
    }

    // Strip first, so a refresh or a shared link cannot replay the intent.
    const next = new URLSearchParams(searchParams.toString());
    next.delete(INTENT_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    if (isNotificationIntent(intentParam)) {
      onIntent(intentParam);
    }
  }, [intentParam, searchParams, pathname, router, onIntent]);

  return null;
}
