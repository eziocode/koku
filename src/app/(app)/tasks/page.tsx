import { Suspense } from "react";

import { TasksClient } from "@/components/tasks/tasks-client";

function TasksPageFallback() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-full bg-muted" />
        <div className="h-9 w-48 rounded-lg bg-muted" />
        <div className="h-5 w-full max-w-xl rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="h-96 rounded-3xl border border-border bg-card" />
        <div className="h-96 rounded-3xl border border-border bg-card" />
        <div className="h-96 rounded-3xl border border-border bg-card" />
        <div className="h-96 rounded-3xl border border-border bg-card" />
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksPageFallback />}>
      <TasksClient />
    </Suspense>
  );
}
