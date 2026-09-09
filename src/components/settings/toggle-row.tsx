"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SETTINGS_ENTRIES_BY_ANCHOR, type SettingsAnchorId } from "@/lib/settings/registry";
import { cn } from "@/lib/utils";

interface ToggleRowProps {
  /**
   * Registry anchor for this control. Its label and description come from
   * `SETTINGS_ENTRIES` rather than the call site, so a searchable setting and
   * the row a user reads can never drift apart — and a renamed one is a type
   * error rather than a dead deep link.
   */
  settingId: SettingsAnchorId;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function ToggleRow({ settingId, checked, disabled, onCheckedChange }: ToggleRowProps) {
  const { label, description } = SETTINGS_ENTRIES_BY_ANCHOR[settingId];

  return (
    <div
      // `data-setting-row` is what a `?highlight=` deep link flashes: the row
      // reads as the setting, where the 20px switch alone would not.
      data-setting-row
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={settingId} className="font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={settingId}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
