"use client";

import { FormEvent, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { toast } from "@/components/ui/toast";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { getUnusedItemColor } from "@/lib/storage/item-colors";
import { filterByQuery } from "@/lib/search/match";

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
  const [projectQuery, setProjectQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  const filteredProjects = filterByQuery(projects, projectQuery, (project) => project.name);
  const filteredCategories = filterByQuery(categories, categoryQuery, (category) => category.name);

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

          <Input
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
          />
          {projectQuery.trim() && (
            <p className="text-xs text-muted-foreground">
              {filteredProjects.length} of {projects.length}
            </p>
          )}

          <LazyScrollList
            items={filteredProjects}
            getKey={(project) => project.id}
            pageSize={10}
            className="h-80"
            listClassName="space-y-2"
            moreLabel="Load more projects"
            empty={
              <p className="text-sm text-muted-foreground">
                {projectQuery.trim() ? `No projects match "${projectQuery.trim()}".` : "No projects yet."}
              </p>
            }
            renderItem={(project) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.hourlyRate ? `$${project.hourlyRate.toFixed(2)} / hour` : "No hourly rate set"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit project" onClick={() => { setEditingProject(project); setProjectDialogOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete project" onClick={() => handleDeleteProject(project.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
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

          <Input
            value={categoryQuery}
            onChange={(event) => setCategoryQuery(event.target.value)}
            placeholder="Search categories…"
            aria-label="Search categories"
          />
          {categoryQuery.trim() && (
            <p className="text-xs text-muted-foreground">
              {filteredCategories.length} of {categories.length}
            </p>
          )}

          <LazyScrollList
            items={filteredCategories}
            getKey={(category) => category.id}
            pageSize={10}
            className="h-80"
            listClassName="space-y-2"
            moreLabel="Load more categories"
            empty={
              <p className="text-sm text-muted-foreground">
                {categoryQuery.trim() ? `No categories match "${categoryQuery.trim()}".` : "No categories yet."}
              </p>
            }
            renderItem={(category) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <p className="truncate text-sm font-medium">{category.name}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit category" onClick={() => { setEditingCategory(category); setCategoryDialogOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete category" onClick={() => handleDeleteCategory(category.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
