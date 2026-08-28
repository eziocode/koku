"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function ToggleRow({ id, label, description, checked, disabled, onCheckedChange }: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
