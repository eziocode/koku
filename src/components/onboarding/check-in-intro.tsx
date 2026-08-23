"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { kokuDb } from "@/lib/storage/db";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { parseSetting } from "@/lib/settings/schema";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

/**
 * Explains the recurring check-in, once, before it can ever surprise anyone.
 *
 * koku's check-in cadence is a real interruption, so the first thing a new user
 * hears about it should be koku itself, phrased as an offer rather than a
 * browser permission prompt with no context. Both paths out of here are
 * legitimate — "Not now" leaves the master switch off, which is already the
 * default, so declining costs the user nothing and changes nothing.
 *
 * Deliberately NOT a toast: a toast auto-dismisses, and a decision the user
 * never saw is not a decision. The dialog blocks until one is made.
 */
export function CheckInIntro() {
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission, request } = useNotificationPermission();
  const { patchValue: patchOnboarding } = useTypedSetting("onboarding");
  const [busy, setBusy] = useState(false);

  /**
   * Read straight from the table rather than through `useTypedSetting`, which
   * cannot distinguish "no row yet" from "row still loading" — both parse to the
   * default, and the default is `null`, which would flash this dialog at every
   * returning user for as long as Dexie takes to answer.
   */
  const row = useLiveQuery(() => kokuDb.settings.get("onboarding"), []);
  const loaded = row !== undefined;
  const onboarding = parseSetting("onboarding", row?.value);

  async function acknowledge() {
    await patchOnboarding({ checkInIntroSeenAt: new Date().toISOString() });
  }

  const intervalMinutes = prefs.checkIn.intervalMinutes;

  // Nothing to introduce where notifications cannot be delivered at all, and
  // nothing to decide if the user already turned them on from settings.
  const open =
    loaded &&
    onboarding.checkInIntroSeenAt === null &&
    support.supported &&
    !prefs.enabled;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Esc / overlay click is a valid "not now" — it must still count as
        // seen, or the dialog reappears on the next navigation.
        if (!next) {
          void acknowledge();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center sm:mx-0">
            <span
              aria-hidden="true"
              className="koku-breathe block h-10 w-10 rounded-full bg-primary/15 ring-1 ring-primary/30"
            />
          </div>
          <DialogTitle>Want koku to check in on you?</DialogTitle>
          <DialogDescription>
            Every {intervalMinutes} minutes, koku can ask what you&apos;re working on — one quiet
            nudge, with a note field right in it. Nothing is tracked or sent anywhere; the reminder
            is just a breath, so you notice the time passing.
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          You can change the interval, set quiet hours, or switch this off entirely at any time in{" "}
          <Link
            href="/settings/notifications"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void acknowledge()}
          >
            Settings → Notifications
          </Link>
          .
        </p>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void acknowledge()}
          >
            Not now
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // Requested from this click so Safari's user-gesture rule holds.
                const next = permission === "granted" ? "granted" : await request();

                if (next !== "granted") {
                  toast.error(
                    "Your browser blocked notifications. Allow them for koku in your site settings, then turn check-ins on from Settings.",
                  );
                  return;
                }

                await patch({ enabled: true, checkIn: { enabled: true } });
                toast.success(`Check-ins on — every ${intervalMinutes} minutes.`);
              } finally {
                setBusy(false);
                await acknowledge();
              }
            }}
          >
            Every {intervalMinutes} minutes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
