"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";

/* ─── Project ──────────────────────────────────────────────────────────────── */

interface QuickCreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function QuickCreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickCreateProjectDialogProps) {
  const { createProject } = useProjects();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#c0392b");
  const [hourlyRate, setHourlyRate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const project = await createProject({
        name: name.trim(),
        color,
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      });
      toast.success("Project created.");
      onCreated(project.id);
      onOpenChange(false);
      setName("");
      setColor("#c0392b");
      setHourlyRate("");
    } catch {
      toast.error("Unable to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Add a new project and it will be selected automatically.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="qc-project-name">Name</Label>
            <Input
              id="qc-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My project"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qc-project-color">Colour</Label>
              <Input
                id="qc-project-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 cursor-pointer px-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-project-rate">Hourly rate (optional)</Label>
              <Input
                id="qc-project-rate"
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            Create &amp; select
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Category ─────────────────────────────────────────────────────────────── */

interface QuickCreateCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function QuickCreateCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickCreateCategoryDialogProps) {
  const { createCategory } = useCategories();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#e74c3c");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const category = await createCategory({ name: name.trim(), color });
      toast.success("Category created.");
      onCreated(category.id);
      onOpenChange(false);
      setName("");
      setColor("#e74c3c");
    } catch {
      toast.error("Unable to create category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create category</DialogTitle>
          <DialogDescription>Add a new category and it will be selected automatically.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="qc-category-name">Name</Label>
            <Input
              id="qc-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My category"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-category-color">Colour</Label>
            <Input
              id="qc-category-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 cursor-pointer px-2"
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            Create &amp; select
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
