import { redirect } from "next/navigation";
import { ReactNode } from "react";

export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    const isLocal = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
    redirect(isLocal ? "/login" : "/__catalyst/auth/login");
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
