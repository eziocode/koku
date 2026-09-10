"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Project } from "@/lib/storage/db";
import { putLocal, updateLocal, deleteLocal, localTransaction } from "@/lib/storage/local-write";

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

    await putLocal(kokuDb.projects, project, true);
    return project;
  }

  async function updateProject(
    id: string,
    patch: Partial<Omit<Project, "id" | "createdAt">>,
  ) {
    await updateLocal(kokuDb.projects, id, patch);
  }

  async function deleteProject(id: string) {
    await localTransaction([kokuDb.projects, kokuDb.timeEntries, kokuDb.tasks], async () => {
      const entries = await kokuDb.timeEntries.where("projectId").equals(id).toArray();
      const tasks = await kokuDb.tasks.where("projectId").equals(id).toArray();
      for (const entry of entries) await putLocal(kokuDb.timeEntries, { ...entry, projectId: null });
      for (const task of tasks) await putLocal(kokuDb.tasks, { ...task, projectId: null });
      await deleteLocal(kokuDb.projects, id);
    });
  }

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
  };
}
