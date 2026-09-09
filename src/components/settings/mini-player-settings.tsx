"use client";

import { useSyncExternalStore } from "react";

import { ToggleRow } from "@/components/settings/toggle-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  detectMiniPlayerCapabilities,
  isMiniPlayerSupported,
} from "@/lib/mini-player/feature-detection";
import { useMiniPlayerPreferences } from "@/lib/notifications/use-notification-preferences";

let cachedSupported: boolean | null = null;

function supported() {
  if (cachedSupported === null) {
    cachedSupported = isMiniPlayerSupported(detectMiniPlayerCapabilities());
  }

  return cachedSupported;
}

/* Capability cannot change during a session, so there is nothing to notify. */
function subscribeSupport() {
  return () => undefined;
}

export function MiniPlayerSettings() {
  const { prefs, patch } = useMiniPlayerPreferences();
  const isSupported = useSyncExternalStore(subscribeSupport, supported, () => false);

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mini player</CardTitle>
          <CardDescription>
            Koku’s floating mini player uses the Document Picture-in-Picture API, which today only
            Chromium browsers (Chrome and Edge 116 and later) support. Your browser doesn’t have it
            yet, so this section is inactive. Nothing else in koku is affected.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mini player</CardTitle>
          <CardDescription>
            A small always-on-top window with your timer, break, and note controls. It floats above
            every tab and every other app, so koku stays visible once you’ve moved on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* These were hand-rolled copies of ToggleRow; folded into the shared
              component so their text lives in the settings registry and stays
              searchable. */}
          <ToggleRow
            settingId="mini-player-enabled"
            checked={prefs.enabled}
            onCheckedChange={(checked) => void patch({ enabled: checked })}
          />

          <ToggleRow
            settingId="mini-player-auto-open"
            checked={prefs.autoOpenOnStart}
            disabled={!prefs.enabled}
            onCheckedChange={(checked) => void patch({ autoOpenOnStart: checked })}
          />

          <ToggleRow
            settingId="mini-player-auto-open-tab-switch"
            checked={prefs.autoOpenOnTabSwitch}
            disabled={!prefs.enabled}
            onCheckedChange={(checked) => void patch({ autoOpenOnTabSwitch: checked })}
          />

          <p className="text-sm text-muted-foreground">
            Only one koku tab can hold the mini player at a time, and leaving the app closes it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
