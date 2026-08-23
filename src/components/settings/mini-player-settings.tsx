"use client";

import { useSyncExternalStore } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  detectMiniPlayerCapabilities,
  isMiniPlayerSupported,
} from "@/lib/mini-player/feature-detection";
import { useMiniPlayerPreferences } from "@/lib/notifications/use-notification-preferences";
import { cn } from "@/lib/utils";

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
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4">
            <div className="min-w-0">
              <Label htmlFor="mini-player-enabled" className="font-medium">
                Offer the mini player
              </Label>
              <p className="text-sm text-muted-foreground">
                Shows the pop-out button. Nothing opens on its own because of this.
              </p>
            </div>
            <Switch
              id="mini-player-enabled"
              checked={prefs.enabled}
              onCheckedChange={(checked) => void patch({ enabled: checked })}
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
              !prefs.enabled && "opacity-50",
            )}
          >
            <div className="min-w-0">
              <Label htmlFor="mini-player-auto-open" className="font-medium">
                Open it when I start a timer
              </Label>
              <p className="text-sm text-muted-foreground">
                Browsers only allow this window to open in response to a click, and starting a timer
                is the one reliable moment. Worth knowing: your browser gives the new window focus,
                so this pulls focus away the instant you hit start.
              </p>
            </div>
            <Switch
              id="mini-player-auto-open"
              checked={prefs.autoOpenOnStart}
              disabled={!prefs.enabled}
              aria-disabled={!prefs.enabled}
              onCheckedChange={(checked) => void patch({ autoOpenOnStart: checked })}
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
              !prefs.enabled && "opacity-50",
            )}
          >
            <div className="min-w-0">
              <Label htmlFor="mini-player-auto-open-tab-switch" className="font-medium">
                Follow me when I switch tabs
              </Label>
              <p className="text-sm text-muted-foreground">
                Pops the player out when you leave koku while something is being tracked, and folds
                it away when you come back. It never opens with nothing running. Chrome only allows
                this for installed apps — add koku to your dock or taskbar and it works everywhere.
              </p>
            </div>
            <Switch
              id="mini-player-auto-open-tab-switch"
              checked={prefs.autoOpenOnTabSwitch}
              disabled={!prefs.enabled}
              aria-disabled={!prefs.enabled}
              onCheckedChange={(checked) => void patch({ autoOpenOnTabSwitch: checked })}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Only one koku tab can hold the mini player at a time, and leaving the app closes it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
