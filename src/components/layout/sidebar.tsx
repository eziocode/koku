"use client";

import { GitFork, MessageSquareWarning, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/layout/logo";
import { DailyQuote } from "@/components/layout/daily-quote";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { appNavigation } from "@/lib/navigation";

interface SidebarProps {
  open: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((body: { user?: { isAdmin?: boolean } | null }) => setIsAdmin(body.user?.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const navigation = isAdmin
    ? [...appNavigation, { title: "Admin", href: "/admin", icon: Settings }]
    : appNavigation;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-dvh w-72 flex-col overflow-hidden border-r border-border/70 bg-card/85 backdrop-blur-xl transition-transform duration-300 lg:sticky lg:top-0 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-hidden px-4 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-border/70 px-6 py-4 text-xs leading-5 text-muted-foreground">
        <DailyQuote />
        <TooltipProvider>
          <div className="mt-3 flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href="https://github.com/eziocode/koku"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="View project on GitHub"
                >
                  <GitFork className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top">Aswin</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href="https://github.com/eziocode/koku/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Report an issue"
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  <span>Report an issue</span>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top">Open GitHub Issues</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </aside>
  );
}
