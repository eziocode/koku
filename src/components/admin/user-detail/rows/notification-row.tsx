"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate, type AdminRow } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

/** One broadcast this user received, in the admin Activity tab. */
export function AdminNotificationRow({ row, timeFormat }: { row: AdminRow; timeFormat: TimeFormat }) {
  const scope = String(row.scope ?? "direct");
  const sender = row.senderName ? String(row.senderName) : null;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="min-w-0 whitespace-pre-wrap break-words font-medium text-foreground">
        {String(row.message || "Empty notification")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{scope === "direct" ? "Direct" : scope}</Badge>
        {sender ? <Badge variant="outline">From {sender}</Badge> : null}
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {formatDate(row.createdAt, timeFormat)}
      </p>
    </div>
  );
}
