"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Project } from "@/lib/storage/db";

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
    return project;
  }

  async function updateProject(
    id: string,
    patch: Partial<Omit<Project, "id" | "createdAt">>,
  ) {
    await kokuDb.projects.update(id, patch);
  }

  async function deleteProject(id: string) {
    await kokuDb.transaction("rw", kokuDb.projects, kokuDb.timeEntries, async () => {
      await kokuDb.timeEntries.where("projectId").equals(id).modify({ projectId: null });
      await kokuDb.projects.delete(id);
    });
  }

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
  };
}
