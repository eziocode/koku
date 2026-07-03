import { Suspense } from "react";

import { LogClient } from "@/components/time-tracker/log-client";

function LogPageFallback() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-full bg-muted" />
        <div className="h-9 w-48 rounded-lg bg-muted" />
        <div className="h-5 w-full max-w-xl rounded-full bg-muted" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-3xl border border-border bg-card" />
        <div className="h-48 rounded-3xl border border-border bg-card" />
      </div>
    </div>
  );
}

export default function TimeLogPage() {
  return (
    <Suspense fallback={<LogPageFallback />}>
      <LogClient />
    </Suspense>
  );
}
