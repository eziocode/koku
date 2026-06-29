import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ProjectManager } from "@/components/settings/project-manager";

export default async function ProjectSettingsPage() {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const projects = await db.project.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Projects</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Manage projects</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Create visual buckets for time tracking, billing, and reporting.
        </p>
      </div>
      <ProjectManager projects={projects} />
    </div>
  );
}
