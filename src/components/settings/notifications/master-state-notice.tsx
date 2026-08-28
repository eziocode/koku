"use client";

import { Info } from "lucide-react";
import Link from "next/link";

interface MasterStateNoticeProps {
  show: boolean;
  message: string;
  /** Where to send the user to flip the gate this notice is warning about. */
  href?: string;
  linkLabel?: string;
}

/**
 * A quiet banner for a sub-page whose controls are gated by a switch that
 * lives on a *different* sub-page — since the notification settings split,
 * a user on e.g. Schedule has no other way to see that check-ins are off.
 */
export function MasterStateNotice({
  show,
  message,
  href = "/settings/notifications/check-ins",
  linkLabel = "Check-in reminders",
}: MasterStateNoticeProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        {message}{" "}
        <Link href={href} className="font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
        .
      </p>
    </div>
  );
}
