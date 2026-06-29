import { endOfDay, format, parseISO, startOfDay } from "date-fns";

import { DailyGrid } from "@/components/time-tracker/daily-grid";
import { EntryForm } from "@/components/time-tracker/entry-form";
import { Timer } from "@/components/time-tracker/timer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function TimeLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const resolvedSearchParams = await searchParams;
  const selectedDate = resolvedSearchParams.date
    ? parseISO(resolvedSearchParams.date)
    : new Date();
  const from = startOfDay(selectedDate);
  const to = endOfDay(selectedDate);

  const [projects, categories, entries] = await Promise.all([
    db.project.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    db.timeEntry.findMany({
      where: {
        userId: session!.user.id,
        workspaceId: workspace.id,
        startAt: { gte: from, lte: to },
      },
      include: { project: true, category: true },
      orderBy: { startAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Time Log</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Daily log</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review the day, add manual entries, and keep your timer running with intention.
          </p>
        </div>
        <form className="flex items-center gap-3">
          <Input type="date" name="date" defaultValue={format(selectedDate, "yyyy-MM-dd")} className="w-[180px]" />
          <Button type="submit" variant="outline">Jump</Button>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Timer projects={projects} categories={categories} />
        <Card>
          <CardHeader>
            <CardTitle>Manual entry</CardTitle>
            <CardDescription>Add a session after the fact, cleanly and quickly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button>New manual entry</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create time entry</DialogTitle>
                  <DialogDescription>Record work from earlier today or another time block.</DialogDescription>
                </DialogHeader>
                <EntryForm projects={projects} categories={categories} />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <DailyGrid entries={entries.map((entry) => ({
        ...entry,
        startAt: entry.startAt.toISOString(),
        endAt: entry.endAt?.toISOString() || null,
      }))} projects={projects} categories={categories} />
    </div>
  );
}
