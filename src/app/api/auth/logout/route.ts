import { NextResponse } from "next/server";

export const runtime = "nodejs";

function logoutRedirect(request: Request): NextResponse {
  const internalUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const rawHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || internalUrl.host;
  const host = rawHost.replace(/:443$/, "");
  const publicHost = !/^(localhost|127(?:\.\d+){3})(:\d+)?$/i.test(host);
  const protocol = forwardedProto === "https" || (publicHost && host.includes("catalystappsail"))
    ? "https"
    : forwardedProto || internalUrl.protocol.replace(":", "");
  const origin = `${protocol}://${host}`;
  // Catalyst clears session, then returns browser to profile so UI reflects signed-out state.
  const redirectUri = `${origin}/settings/account`;
  const response = NextResponse.redirect(`${origin}/__catalyst/auth/logout?redirect_uri=${encodeURIComponent(redirectUri)}`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request): Promise<NextResponse> { return logoutRedirect(request); }
export async function POST(request: Request): Promise<NextResponse> { return logoutRedirect(request); }
