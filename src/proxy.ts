import { NextRequest, NextResponse } from "next/server";

const CATALYST_LOGIN = "/__catalyst/auth/login";
const LOCAL_LOGIN = "/login";

const protectedPrefixes = [
  "/dashboard",
  "/log",
  "/notes",
  "/graph",
  "/reports",
  "/ai",
  "/settings",
];

function hasSession(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_LOCAL_MODE === "true") {
    return request.cookies.has("__koku_local_session");
  }
  // Catalyst injects x-zc-cookie when the user is authenticated.
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

  if (isProtectedRoute && !hasSession(request)) {
    const isLocal = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
    const loginUrl = new URL(isLocal ? LOCAL_LOGIN : CATALYST_LOGIN, request.url);
    loginUrl.searchParams.set(
      isLocal ? "callbackUrl" : "redirectURL",
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
