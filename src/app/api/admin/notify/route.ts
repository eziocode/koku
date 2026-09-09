import { NextResponse } from "next/server";

import { initCatalyst, upsertRow } from "@/lib/db/catalyst-client";
import { TABLE_CONFIG } from "@/lib/sync/table-config";
import { getAdminKeys, isOwnerUser } from "@/lib/auth/user-registry";
import { adminUserFromDetails, type CatalystUserDetails } from "@/lib/admin-data";

export const runtime = "nodejs";

async function requireAdmin(request: Request) {
  const app = initCatalyst(request);
  const user = await app.userManagement().getCurrentUser();
  const isOwner = await isOwnerUser(app, user.user_id);
  if (isOwner) return { app, user };

  const isDelegatedAdmin = (await getAdminKeys(app)).includes(`admin_user:${user.user_id}`);
  if (!isDelegatedAdmin) return null;
  return { app, user };
}

type NotifyBody = {
  message?: string;
  target?: "global" | { userIds?: string[] };
};

// POST /api/admin/notify — fan out an admin alert to one or every user.
// Writes directly into notifications_koku with the recipient as user_id,
// bypassing the generic per-caller /api/sync/[table] push (see upsertRow's
// admin-scoped use in /api/admin's PATCH handler for the same pattern).
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as NotifyBody;
    const message = String(body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

    let targetIds: string[];
    let scope: "global" | "direct";
    if (body.target === "global") {
      const allUsers = await auth.app.userManagement().getAllUsers() as CatalystUserDetails[];
      targetIds = allUsers.map((u) => adminUserFromDetails(u)?.id).filter((id): id is string => Boolean(id));
      scope = "global";
    } else {
      const userIds = Array.isArray(body.target?.userIds) ? body.target.userIds.map(String).filter(Boolean) : [];
      if (!userIds.length) return NextResponse.json({ error: "At least one recipient required" }, { status: 400 });
      targetIds = userIds;
      scope = "direct";
    }

    const senderName = adminUserFromDetails(auth.user)?.displayName || adminUserFromDetails(auth.user)?.email || "Admin";
    const config = TABLE_CONFIG.notifications;
    const createdAt = new Date().toISOString();

    await Promise.all(targetIds.map((userId) =>
      upsertRow(auth.app, config.table, userId, crypto.randomUUID(), config.toFields({
        message,
        senderName,
        scope,
        createdAt,
      })),
    ));

    return NextResponse.json({ sent: targetIds.length });
  } catch {
    return NextResponse.json({ error: "Unable to send notification" }, { status: 500 });
  }
}
