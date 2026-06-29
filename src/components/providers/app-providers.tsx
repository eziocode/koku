"use client";

import { useTheme } from "next-themes";
import { ReactNode } from "react";

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
        {children}
        <ThemedToaster />
      </QueryProvider>
    </ThemeProvider>
  );
}
