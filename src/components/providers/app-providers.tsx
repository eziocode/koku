"use client";

import { useTheme } from "next-themes";
import { ReactNode } from "react";

import { AppearanceProvider } from "@/components/providers/appearance-provider";
import { CloudSyncBootstrap } from "@/components/providers/cloud-sync-bootstrap";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <CloudSyncBootstrap />
        <AppearanceProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </AppearanceProvider>
        <ThemedToaster />
      </QueryProvider>
    </ThemeProvider>
  );
}
