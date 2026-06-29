"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card/90 backdrop-blur transition-transform duration-300 lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
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
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="border-t border-border px-6 py-4 text-xs text-muted-foreground">
        Mark the moment. Master your time.
      </div>
    </aside>
  );
}
