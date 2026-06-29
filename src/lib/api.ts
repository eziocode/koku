import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function requireUserContext() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const workspace = await getCurrentWorkspace(session.user.id);

  return {
    session,
    userId: session.user.id,
    workspace,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(error: unknown) {
  return NextResponse.json(
    {
      error: "Invalid request",
      details: error,
    },
    { status: 400 },
  );
}

export function serverError(message = "Something went wrong") {
  return NextResponse.json({ error: message }, { status: 500 });
}
