import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { ensureDefaultWorkspace } from "@/lib/workspace";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Hash the password before the existence check so both code paths
    // take similar time, preventing timing-based email enumeration.
    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

    const existingUser = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const user = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashedPassword,
        preferences: {
          theme: "system",
          focusMode: false,
        },
      },
    });

    await ensureDefaultWorkspace(user.id);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Registration failed", error);
    return NextResponse.json(
      { error: "Unable to create account." },
      { status: 500 },
    );
  }
}
