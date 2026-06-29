"use client";

import { Bell, LogOut, Menu, MoonStar, Settings, SunMedium, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getInitials } from "@/lib/utils";

interface TopbarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  onOpenSidebar: () => void;
}

export function Topbar({ user, onOpenSidebar }: TopbarProps) {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar}>
        <Menu />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Welcome back</p>
        <p className="truncate text-sm text-muted-foreground">
          Build momentum across projects, ideas, and focus cycles.
        </p>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? <SunMedium /> : <MoonStar />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-11 gap-3 rounded-full px-2">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
              <AvatarFallback>{getInitials(user.name || user.email)}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="max-w-32 truncate text-sm font-medium text-foreground">
                {user.name || "Koku User"}
              </p>
              <p className="max-w-32 truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1">
            <div>{user.name || "Koku User"}</div>
            <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/account">
              <UserCircle2 className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              window.location.href = "/__catalyst/auth/logout?redirectURL=/";
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
