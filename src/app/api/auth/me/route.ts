import { NextResponse } from "next/server";
import { initCatalyst, upsertRow } from "@/lib/db/catalyst-client";
import { ADMIN_EMAIL } from "@/lib/auth/constants";
import { getAdminKeys, USER_TABLE } from "@/lib/auth/user-registry";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const app = initCatalyst(request);
    const user = await app.userManagement().getCurrentUser();
    let delegatedAdmin = false;
    try {
      delegatedAdmin = (await getAdminKeys(app)).includes(`admin_user:${user.user_id}`);
    } catch {
      // Fixed owner access still works if admin registry table is unavailable.
    }
    // Keep identity metadata in dedicated user registry table.
    try {
      const key = `profile:${user.user_id}`;
      await upsertRow(app, USER_TABLE, user.user_id, key, {
        key_koku: key,
        value_koki: JSON.stringify({ email: user.email_id, displayName: `${user.first_name} ${user.last_name}`.trim() }),
      });
    } catch { /* Profile metadata must not block auth response. */ }
    return NextResponse.json({
      user: {
        id: user.user_id,
        email: user.email_id,
        displayName: `${user.first_name} ${user.last_name}`.trim(),
        isAdmin: user.email_id?.toLowerCase() === ADMIN_EMAIL || delegatedAdmin,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
