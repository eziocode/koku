"use client";

import { FormEvent, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { toast } from "@/components/ui/toast";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { getUnusedItemColor } from "@/lib/storage/item-colors";

interface ProjectRecord {
  id: string;
  name: string;
  color: string;
  hourlyRate?: number | null;
}

interface CategoryRecord {
  id: string;
  name: string;
  color: string;
}

function ProjectEditor({
  project,
  suggestedColor,
  onSaved,
}: {
  project?: ProjectRecord;
  suggestedColor: string;
  onSaved: () => void;
}) {
  const { createProject, updateProject } = useProjects();
  const [name, setName] = useState(project?.name || "");
  const [color, setColor] = useState(project?.color ?? suggestedColor);
  const [hourlyRate, setHourlyRate] = useState(project?.hourlyRate?.toString() || "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (project) {
        await updateProject(project.id, {
          name,
          color,
          hourlyRate: hourlyRate ? Number(hourlyRate) : null,
        });
      } else {
        await createProject({
          name,
          color,
          hourlyRate: hourlyRate ? Number(hourlyRate) : null,
        });
      }

      toast.success(project ? "Project updated." : "Project created.");
      onSaved();
    } catch {
      toast.error("Unable to save project.");
    }
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

function CategoryEditor({
  category,
  suggestedColor,
  onSaved,
}: {
  category?: CategoryRecord;
  suggestedColor: string;
  onSaved: () => void;
}) {
  const { createCategory, updateCategory } = useCategories();
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(category?.color ?? suggestedColor);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (category) {
        await updateCategory(category.id, { name, color });
      } else {
        await createCategory({ name, color });
      }

      toast.success(category ? "Category updated." : "Category created.");
      onSaved();
    } catch {
      toast.error("Unable to save category.");
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="category-name">Name</Label>
        <Input id="category-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category-color">Color</Label>
        <Input id="category-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
      </div>
      <Button type="submit">{category ? "Update category" : "Create category"}</Button>
    </form>
  );
}

export function ProjectManager() {
  const { projects, deleteProject } = useProjects();
  const { categories, deleteCategory } = useCategories();
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);

  async function handleDeleteProject(id: string) {
    try {
      await deleteProject(id);
      toast.success("Project deleted.");
    } catch {
      toast.error("Unable to delete project.");
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteCategory(id);
      toast.success("Category deleted.");
    } catch {
      toast.error("Unable to delete category.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Projects</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Manage projects & categories</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Create visual buckets for time tracking, billing, and local reporting.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Projects</h2>
              <p className="text-sm text-muted-foreground">Track work streams, colors, and hourly rates.</p>
            </div>
            <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingProject(null)}>Create project</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProject ? "Edit project" : "Create project"}</DialogTitle>
                  <DialogDescription>Capture billing details and color coding for your work.</DialogDescription>
                </DialogHeader>
                <ProjectEditor key={`${projectDialogOpen}-${editingProject?.id ?? "new"}`} project={editingProject || undefined} suggestedColor={getUnusedItemColor(projects, categories)} onSaved={() => setProjectDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <LazyScrollList
            items={projects}
            getKey={(project) => project.id}
            pageSize={10}
            className="h-[40rem]"
            listClassName="space-y-4"
            moreLabel="Load more projects"
            empty={<p className="text-sm text-muted-foreground">No projects yet.</p>}
            renderItem={(project) => (
              <Card>
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
                  <Button variant="outline" onClick={() => { setEditingProject(project); setProjectDialogOpen(true); }}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => handleDeleteProject(project.id)}>
                    <Trash2 className="text-destructive" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            )}
          />
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Categories</h2>
              <p className="text-sm text-muted-foreground">Tag sessions with reusable activity groupings.</p>
            </div>
            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingCategory(null)} variant="outline">Create category</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? "Edit category" : "Create category"}</DialogTitle>
                  <DialogDescription>Use categories to group similar kinds of work.</DialogDescription>
                </DialogHeader>
                <CategoryEditor key={`${categoryDialogOpen}-${editingCategory?.id ?? "new"}`} category={editingCategory || undefined} suggestedColor={getUnusedItemColor(projects, categories)} onSaved={() => setCategoryDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <LazyScrollList
            items={categories}
            getKey={(category) => category.id}
            pageSize={10}
            className="h-[40rem]"
            listClassName="space-y-4"
            moreLabel="Load more categories"
            empty={<p className="text-sm text-muted-foreground">No categories yet.</p>}
            renderItem={(category) => (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{category.name}</CardTitle>
                      <CardDescription>Reusable across all local time entries.</CardDescription>
                    </div>
                    <Badge variant="outline" style={{ borderColor: category.color, color: category.color }}>
                      {category.color}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button variant="outline" onClick={() => { setEditingCategory(category); setCategoryDialogOpen(true); }}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => handleDeleteCategory(category.id)}>
                    <Trash2 className="text-destructive" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            )}
          />
        </div>
      </div>
    </div>
  );
}
