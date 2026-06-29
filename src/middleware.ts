import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/log",
  "/notes",
  "/graph",
  "/reports",
  "/ai",
  "/settings",
];

function hasSessionCookie(request: NextRequest) {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token")
  );
}

export default function middleware(request: NextRequest) {
  const isProtectedRoute = protectedPrefixes.some(
    (prefix) =>
      request.nextUrl.pathname === prefix ||
      request.nextUrl.pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedRoute && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
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
