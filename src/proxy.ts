import { NextResponse } from "next/server";

export function proxy() {
  return NextResponse.next();
}

export const config = {
  // Without a matcher, Proxy runs on every request including static assets,
  // image optimizations, and files in public/. Scope it to real page/API
  // routes and exclude Next.js internals and static file requests.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff2?|ttf)$).*)",
  ],
};
