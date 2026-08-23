import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  // Catalyst clears its own session cookie on this endpoint
  return NextResponse.redirect(`${origin}/__catalyst/auth/logout`);
}
