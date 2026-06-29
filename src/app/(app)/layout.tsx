import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/__catalyst/auth/login");
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
