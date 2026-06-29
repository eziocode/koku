import { NextRequest, NextResponse } from "next/server";

const CATALYST_LOGIN = "/__catalyst/auth/login";

const protectedPrefixes = [
  "/dashboard",
  "/log",
  "/notes",
  "/graph",
  "/reports",
  "/ai",
  "/settings",
];

function hasCatalystSession(request: NextRequest) {
  // Catalyst injects x-zc-cookie when the user is authenticated.
  // Also check the raw __zldk browser cookie as a fallback.
  return (
    !!request.headers.get("x-zc-cookie") ||
    request.cookies.has("__zldk") ||
    request.cookies.has("__Secure-zldk")
  );
}

export default function middleware(request: NextRequest) {
  const isProtectedRoute = protectedPrefixes.some(
    (prefix) =>
      request.nextUrl.pathname === prefix ||
      request.nextUrl.pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedRoute && !hasCatalystSession(request)) {
    const loginUrl = new URL(CATALYST_LOGIN, request.url);
    loginUrl.searchParams.set(
      "redirectURL",
      encodeURIComponent(request.nextUrl.pathname),
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/log/:path*",
    "/notes/:path*",
    "/graph/:path*",
    "/reports/:path*",
    "/ai/:path*",
    "/settings/:path*",
  ],
};
