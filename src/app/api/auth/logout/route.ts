import { NextResponse } from "next/server";

export const runtime = "nodejs";

function logoutRedirect(request: Request): NextResponse {
  const origin = new URL(request.url).origin;
  // Catalyst clears session, then returns browser to homepage.
  return NextResponse.redirect(`${origin}/__catalyst/auth/logout?redirect_uri=${encodeURIComponent(`${origin}/`)}`);
}

export async function GET(request: Request): Promise<NextResponse> { return logoutRedirect(request); }
export async function POST(request: Request): Promise<NextResponse> { return logoutRedirect(request); }
