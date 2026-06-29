import { db } from "@/lib/db";

export async function ensureDefaultWorkspace(userId: string) {
  const existingWorkspace = await db.workspace.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  return db.workspace.create({
    data: {
      userId,
      name: "Personal Workspace",
      settings: {
        startOfWeek: 1,
        accent: "#c0392b",
      },
    },
  });
}

export async function getCurrentWorkspace(userId: string) {
  return ensureDefaultWorkspace(userId);
}
