"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Project } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

const EMPTY_PROJECTS: Project[] = [];

interface CreateProjectInput {
  name: string;
  color: string;
  hourlyRate?: number | null;
}

export function useProjects() {
  const projects = useLiveQuery(
    () => kokuDb.projects.orderBy("createdAt").reverse().toArray(),
    [],
    EMPTY_PROJECTS,
  );

  async function createProject(data: CreateProjectInput) {
    const project: Project = {
      id: crypto.randomUUID(),
      name: data.name,
      color: data.color,
      hourlyRate: data.hourlyRate ?? null,
      createdAt: new Date().toISOString(),
    };

    await kokuDb.projects.add(project);
    void syncRow("projects", project);
    return project;
  }

  async function updateProject(
    id: string,
    patch: Partial<Omit<Project, "id" | "createdAt">>,
  ) {
    await kokuDb.projects.update(id, patch);
    const updated = await kokuDb.projects.get(id);
    if (updated) void syncRow("projects", updated);
  }

  async function deleteProject(id: string) {
    const [affectedEntries, affectedTasks] = await kokuDb.transaction(
      "rw",
      kokuDb.projects,
      kokuDb.timeEntries,
      kokuDb.tasks,
      async () => {
        const entries = await kokuDb.timeEntries.where("projectId").equals(id).toArray();
        const tasks = await kokuDb.tasks.where("projectId").equals(id).toArray();
        await kokuDb.timeEntries.where("projectId").equals(id).modify({ projectId: null });
        await kokuDb.tasks.where("projectId").equals(id).modify({ projectId: null });
        await kokuDb.projects.delete(id);
        return [entries, tasks];
      },
    );
    await Promise.all([
      ...affectedEntries.map((entry) => syncRow("timeEntries", { ...entry, projectId: null })),
      ...affectedTasks.map((task) => syncRow("tasks", { ...task, projectId: null })),
    ]);
    void deleteRow("projects", id);
  }

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
  };
}
