"use client";

import { ToggleRow } from "@/components/settings/toggle-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { playReminderChime } from "@/lib/notifications/sound";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { cn } from "@/lib/utils";

/** Master mute + volume for reminder sound-fx, and everything else that plays one. */
export function SoundSettings() {
  const { prefs, patch } = useNotificationPreferences();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sound</CardTitle>
          <CardDescription>
            The chime reminders play when they fire. Turning this off keeps reminders silent, the
            message still shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="sound-enabled"
            label="Play a sound for reminders"
            description="Turn off to silence reminder sound-fx entirely."
            checked={prefs.sound.enabled}
            onCheckedChange={(checked) => void patch({ sound: { enabled: checked } })}
          />

          <div className={cn("space-y-2", !prefs.sound.enabled && "opacity-50")}>
            <Label htmlFor="sound-volume">Volume</Label>
            <input
              id="sound-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={!prefs.sound.enabled}
              value={prefs.sound.volume}
              onChange={(event) => void patch({ sound: { volume: Number(event.target.value) } })}
              className="w-full accent-primary"
            />
          </div>

          <Button
            variant="outline"
            disabled={!prefs.sound.enabled}
            onClick={() => playReminderChime(prefs.sound.volume)}
          >
            Preview sound
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
