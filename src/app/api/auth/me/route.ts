import { NextResponse } from "next/server";
import { initCatalyst } from "@/lib/db/catalyst-client";

export const runtime = "nodejs";

export const ADMIN_EMAIL = "aswin.kg@zohocorp.com";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const app = initCatalyst(request);
    const user = await app.userManagement().getCurrentUser();
    return NextResponse.json({
      user: {
        id: user.user_id,
        email: user.email_id,
        displayName: `${user.first_name} ${user.last_name}`.trim(),
        isAdmin: user.email_id?.toLowerCase() === ADMIN_EMAIL,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
