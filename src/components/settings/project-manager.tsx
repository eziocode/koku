"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

interface ProjectRecord {
  id: string;
  name: string;
  color: string;
  hourlyRate: number | null;
}

function ProjectEditor({
  project,
  onSaved,
}: {
  project?: ProjectRecord;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(project?.name || "");
  const [color, setColor] = useState(project?.color || "#c0392b");
  const [hourlyRate, setHourlyRate] = useState(project?.hourlyRate?.toString() || "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
      method: project ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        color,
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      }),
    });

    if (!response.ok) {
      toast.error("Unable to save project.");
      return;
    }

    toast.success(project ? "Project updated." : "Project created.");
    router.refresh();
    onSaved();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="project-name">Name</Label>
        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="project-color">Color</Label>
          <Input id="project-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-rate">Hourly rate</Label>
          <Input id="project-rate" type="number" min="0" step="0.01" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="0.00" />
        </div>
      </div>
      <Button type="submit">{project ? "Update project" : "Create project"}</Button>
    </form>
  );
}

export function ProjectManager({ projects }: { projects: ProjectRecord[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);

  async function handleDelete(id: string) {
    const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Unable to delete project.");
      return;
    }

    toast.success("Project deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => setEditingProject(null)}>Create project</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit project" : "Create project"}</DialogTitle>
            <DialogDescription>Capture billing details and color coding for your work.</DialogDescription>
          </DialogHeader>
          <ProjectEditor project={editingProject || undefined} onSaved={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription>
                    {project.hourlyRate ? `$${project.hourlyRate.toFixed(2)} / hour` : "No hourly rate set"}
                  </CardDescription>
                </div>
                <Badge variant="outline" style={{ borderColor: project.color, color: project.color }}>
                  {project.color}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" onClick={() => { setEditingProject(project); setDialogOpen(true); }}>
                <Pencil />
                Edit
              </Button>
              <Button variant="ghost" onClick={() => handleDelete(project.id)}>
                <Trash2 className="text-destructive" />
                Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
