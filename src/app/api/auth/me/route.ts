import { NextResponse } from "next/server";
import { initCatalyst, zcqlQuery } from "@/lib/db/catalyst-client";
import { ADMIN_EMAIL } from "@/lib/auth/constants";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const app = initCatalyst(request);
    const user = await app.userManagement().getCurrentUser();
    let delegatedAdmin = false;
    try {
      const adminRows = await zcqlQuery(app, "SELECT setting_key FROM settings_koku");
      delegatedAdmin = adminRows.some((row) => {
        const tableRow = (row.settings_koku ?? row) as Record<string, unknown>;
        return tableRow.setting_key === `admin_user:${user.user_id}`;
      });
    } catch {
      // Fixed owner access still works if admin registry table is unavailable.
    }
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
