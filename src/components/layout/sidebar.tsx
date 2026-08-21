"use client";

import { GitFork, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { appNavigation } from "@/lib/navigation";

interface SidebarProps {
  open: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border/70 bg-card/85 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
        <Logo />
      </div>
      <ScrollArea className="flex-1 px-4 py-4">
        <nav className="space-y-1">
          {appNavigation.map((item) => {
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
      </ScrollArea>
      <div className="border-t border-border/70 px-6 py-4 text-xs leading-5 text-muted-foreground">
        <p>Mark the moment. Master your time.</p>
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
