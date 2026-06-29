import { headers } from "next/headers";

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

export async function auth(): Promise<AppSession | null> {
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
