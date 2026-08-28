"use client";

import {
  BookOpen,
  Car,
  Coffee,
  Dumbbell,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
  MAX_QUICK_ACTIONS,
  QUICK_ACTION_ICONS,
  type QuickActionIcon,
  type QuickActionPreset,
} from "@/lib/notifications/settings";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { cn } from "@/lib/utils";

/** Local copy of `notification-settings.tsx`'s row — kept private to that file. */
function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} aria-disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

const ICONS: Record<QuickActionIcon, typeof Phone> = {
  Phone,
  Users,
  MessageCircle,
  Mail,
  Coffee,
  Utensils,
  Car,
  Dumbbell,
  BookOpen,
  Sparkles,
};

const NONE = "none";

interface DraftState {
  id: string | null;
  label: string;
  icon: QuickActionIcon;
  tag: string;
  defaultMinutes: string;
  projectId: string;
  categoryId: string;
  description: string;
}

function emptyDraft(): DraftState {
  return {
    id: null,
    label: "",
    icon: "Sparkles",
    tag: "",
    defaultMinutes: "0",
    projectId: NONE,
    categoryId: NONE,
    description: "",
  };
}

function toDraft(item: QuickActionPreset): DraftState {
  return {
    id: item.id,
    label: item.label,
    icon: item.icon,
    tag: item.tag,
    defaultMinutes: String(item.defaultMinutes),
    projectId: item.projectId ?? NONE,
    categoryId: item.categoryId ?? NONE,
    description: item.description,
  };
}

export function QuickActionsCard() {
  const { prefs, patch } = useNotificationPreferences();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  const items = prefs.quickActions.items;

  function openCreate() {
    if (items.length >= MAX_QUICK_ACTIONS) {
      toast.error(`You can have up to ${MAX_QUICK_ACTIONS} quick actions.`);
      return;
    }
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(item: QuickActionPreset) {
    setDraft(toDraft(item));
    setOpen(true);
  }

  async function save() {
    const label = draft.label.trim();
    if (!label) {
      toast.error("Give the action a label.");
      return;
    }

    const tag = (draft.tag.trim() || label).toLowerCase().replace(/\s+/g, "-");
    const minutes = Math.max(0, Math.min(240, Math.round(Number(draft.defaultMinutes) || 0)));

    const preset: QuickActionPreset = {
      id: draft.id ?? crypto.randomUUID(),
      label,
      icon: draft.icon,
      tag,
      defaultMinutes: minutes,
      projectId: draft.projectId === NONE ? null : draft.projectId,
      categoryId: draft.categoryId === NONE ? null : draft.categoryId,
      description: draft.description.trim(),
    };

    const nextItems = draft.id
      ? items.map((item) => (item.id === draft.id ? preset : item))
      : [...items, preset];

    await patch({ quickActions: { items: nextItems } });
    toast.success(draft.id ? "Quick action updated." : "Quick action added.");
    setOpen(false);
  }

  async function remove(id: string) {
    await patch({ quickActions: { items: items.filter((item) => item.id !== id) } });
    toast.success("Quick action removed.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>
          One-click buttons next to Break — for calls, standups, anything you want tracked but
          don’t want to fill in a form for. Each pauses your running timers and, unlike a plain
          break, logs its own time entry with a default project and category, so it counts as work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleRow
          id="quick-actions-enabled"
          label="Show quick action buttons"
          description="Turn off to hide them entirely."
          checked={prefs.quickActions.enabled}
          onCheckedChange={(checked) => void patch({ quickActions: { enabled: checked } })}
        />

        <div className={cn("space-y-2", !prefs.quickActions.enabled && "opacity-50")}>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quick actions configured yet.</p>
          ) : (
            items.map((item) => {
              const Icon = ICONS[item.icon] ?? Sparkles;
              const project = projects.find((p) => p.id === item.projectId);
              const category = categories.find((c) => c.id === item.categoryId);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        #{item.tag}
                        {item.defaultMinutes > 0 ? ` · ${item.defaultMinutes} min` : " · open-ended"}
                        {project ? ` · ${project.name}` : ""}
                        {category ? ` · ${category.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={!prefs.quickActions.enabled} onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={!prefs.quickActions.enabled} onClick={() => void remove(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          <Button variant="outline" className="gap-2" disabled={!prefs.quickActions.enabled} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add quick action
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit quick action" : "New quick action"}</DialogTitle>
            <DialogDescription>
              Project and category are optional — leave them unset to assign later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qa-label">Label</Label>
              <Input
                id="qa-label"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Call"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Select value={draft.icon} onValueChange={(v) => setDraft((d) => ({ ...d, icon: v as QuickActionIcon }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_ACTION_ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-minutes">Default length (min)</Label>
                <Input
                  id="qa-minutes"
                  type="number"
                  min={0}
                  max={240}
                  value={draft.defaultMinutes}
                  onChange={(e) => setDraft((d) => ({ ...d, defaultMinutes: e.target.value }))}
                  placeholder="0 = open-ended"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qa-tag">Tag</Label>
              <Input
                id="qa-tag"
                value={draft.tag}
                onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
                placeholder="call (defaults to the label)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Default project</Label>
                <Select value={draft.projectId} onValueChange={(v) => setDraft((d) => ({ ...d, projectId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default category</Label>
                <Select value={draft.categoryId} onValueChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()}>{draft.id ? "Save changes" : "Add action"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
