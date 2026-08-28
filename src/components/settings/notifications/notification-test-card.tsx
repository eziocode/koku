"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { explainShowFailure, showKokuNotificationDetailed } from "@/lib/notifications/client";
import { buildTestNotification } from "@/lib/notifications/payload";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";

/**
 * Send-a-test-notification and reset-to-defaults, split out of the old
 * `NotificationSettings` monolith. Rendered on the notifications sub-index
 * rather than under any one group, since it applies to all of them.
 */
export function NotificationTestCard() {
  const { prefs, reset } = useNotificationPreferences();
  const { support, permission } = useNotificationPermission();
  const granted = permission === "granted";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test and reset</CardTitle>
        <CardDescription>
          Send one to yourself to see exactly how it looks, and how many buttons your browser shows.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!granted}
          onClick={async () => {
            const result = await showKokuNotificationDetailed(
              buildTestNotification(prefs, { maxActions: support.maxActions }),
            );

            if (!result.shown) {
              toast.error(explainShowFailure(result) ?? "Couldn’t show the notification.");
              return;
            }

            // The browser accepted it. If nothing appears from here it is the
            // operating system suppressing it, which no web API can detect —
            // so say so rather than claim success outright.
            if (result.via === "constructor") {
              toast.success("Sent, without buttons, because the service worker wasn’t ready.");
            } else {
              toast.success("Sent. If nothing appeared, check your OS notification settings for your browser.");
            }
          }}
        >
          Send test notification
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await reset();
            toast.success("Notification settings reset.");
          }}
        >
          Reset to defaults
        </Button>
      </CardContent>
    </Card>
  );
}
