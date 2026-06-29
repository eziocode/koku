import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";
import { ensureDefaultWorkspace } from "@/lib/workspace";

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

interface CatalystUser {
  user_id: string;
  email_id: string;
  first_name: string;
  last_name: string;
}

// ── Local mode (LOCAL_MODE=true) ──────────────────────────────────────────────
async function getLocalSession(): Promise<AppSession | null> {
  if (process.env.LOCAL_MODE !== "true") return null;

  const cookieStore = await cookies();
  const raw = cookieStore.get("__koku_local_session")?.value;
  if (!raw) return null;

  try {
    const { decryptValue } = await import("@/lib/encryption");
    const email = decryptValue(raw);
    if (!email) return null;

    const user = await db.user.findUnique({ where: { email } });
    if (!user) return null;

    return {
      user: { id: user.id, email: user.email, name: user.name, image: user.image },
    };
  } catch {
    return null;
  }
}

// ── Catalyst mode (default) ───────────────────────────────────────────────────
async function getCatalystUser(): Promise<CatalystUser | null> {
  try {
    // zcatalyst-sdk-node only runs in Node.js; Catalyst injects x-zc-* project
    // headers into every request so initialize() can identify the project + user.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalyst = require("zcatalyst-sdk-node");
    const headerStore = await headers();
    const headersObj = Object.fromEntries(headerStore.entries());
    const app = catalyst.initialize({ headers: headersObj });
    return (await app.userManagement().getCurrentUser()) as CatalystUser;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function auth(): Promise<AppSession | null> {
  // 1. Local session cookie (LOCAL_MODE only)
  const localSession = await getLocalSession();
  if (localSession) return localSession;

  // 2. Catalyst SDK auth
  const catalystUser = await getCatalystUser();
  if (!catalystUser?.email_id) return null;

  let user = await db.user.findUnique({ where: { email: catalystUser.email_id } });

  if (!user) {
    user = await db.user.create({
      data: {
        email: catalystUser.email_id,
        name:
          `${catalystUser.first_name ?? ""} ${catalystUser.last_name ?? ""}`.trim() ||
          null,
      },
    });
    await ensureDefaultWorkspace(user.id);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  };
}
