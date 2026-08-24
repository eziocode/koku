import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function logoutRedirect(request: Request): Promise<NextResponse> {
  const internalUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const rawHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || internalUrl.host;
  const host = rawHost.replace(/:443$/, "");
  const publicHost = !/^(localhost|127(?:\.\d+){3})(:\d+)?$/i.test(host);
  const protocol = forwardedProto === "https" || (publicHost && host.includes("catalystappsail"))
    ? "https"
    : forwardedProto || internalUrl.protocol.replace(":", "");
  const origin = `${protocol}://${host}`;

  // After Catalyst clears the session it redirects the browser to this URI.
  // We send the user back to the home (Profiles) page so the UI fully
  // reflects the signed-out state.
  const redirectUri = `${origin}/`;
  const catalystLogoutUrl = `${origin}/__catalyst/auth/logout?redirect_uri=${encodeURIComponent(redirectUri)}`;

  // Probe whether the Catalyst logout endpoint is reachable before sending the
  // browser there. In local development (or any environment where Catalyst is
  // not deployed) the endpoint does not exist and Catalyst returns an
  // INVALID_URL_PATTERN JSON error instead of performing a redirect.
  // In those cases we fall back to redirecting the browser straight to the
  // home page so login details appear cleared from the user's perspective.
  try {
    const probe = await fetch(catalystLogoutUrl, {
      method: "GET",
      redirect: "manual", // we only want to check the response, not follow it
    });
    // A proper Catalyst logout starts with a 3xx redirect.
    // Any non-redirect (e.g. 200 with JSON error body) means it failed.
    if (probe.status >= 300 && probe.status < 400) {
      const response = NextResponse.redirect(catalystLogoutUrl);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  } catch {
    // Network error — Catalyst is not reachable; fall through to home redirect.
  }

  // Fallback: redirect straight to the home (Profiles) page.
  const response = NextResponse.redirect(`${origin}/`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request): Promise<NextResponse> { return logoutRedirect(request); }
export async function POST(request: Request): Promise<NextResponse> { return logoutRedirect(request); }

