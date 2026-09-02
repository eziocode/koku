import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BookOpenText,
  ChartColumnBig,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Network,
  Settings,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Renders a beta badge beside the label in the sidebar. */
  beta?: boolean;
}

export const appNavigation: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Time Log", href: "/log", icon: Clock3 },
  { title: "Tasks", href: "/tasks", icon: ListChecks },
  { title: "Notes", href: "/notes", icon: BookOpenText },
  { title: "Graph", href: "/graph", icon: Network },
  { title: "Reports", href: "/reports", icon: ChartColumnBig },
  { title: "AI", href: "/ai", icon: Bot, beta: true },
  { title: "Settings", href: "/settings", icon: Settings },
];
