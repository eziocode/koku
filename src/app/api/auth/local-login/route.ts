import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { encryptValue } from "@/lib/encryption";
import { ensureDefaultWorkspace } from "@/lib/workspace";

function localModeOnly() {
  if (process.env.LOCAL_MODE !== "true") {
    return NextResponse.json({ error: "Not available in cloud mode." }, { status: 403 });
  }
  return null;
}

async function setLocalSession(email: string) {
  const cookieStore = await cookies();
  cookieStore.set("__koku_local_session", encryptValue(email), {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/** POST /api/auth/local-login
 *  Body: { email, password }              → sign in
 *  Body: { email, password, name }        → register then sign in
 */
export async function POST(request: Request) {
  const guard = localModeOnly();
  if (guard) return guard;

  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email: string;
      password: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Registration path
    if (name !== undefined) {
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "Email already registered." }, { status: 409 });
      }
      const hashed = await bcrypt.hash(password, 12);
      const newUser = await db.user.create({ data: { email, name, password: hashed } });
      await ensureDefaultWorkspace(newUser.id);
      await setLocalSession(email);
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    // Login path
    const user = await db.user.findUnique({ where: { email } });
    if (!user?.password) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    await setLocalSession(email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[local-login]", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/** DELETE /api/auth/local-login → sign out */
export async function DELETE() {
  const guard = localModeOnly();
  if (guard) return guard;

  const cookieStore = await cookies();
  cookieStore.delete("__koku_local_session");
  return NextResponse.json({ ok: true });
}
