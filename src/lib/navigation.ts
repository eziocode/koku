import {
  Bot,
  BookOpenText,
  ChartColumnBig,
  Clock3,
  LayoutDashboard,
  Network,
  Settings,
} from "lucide-react";

export const appNavigation = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Time Log", href: "/log", icon: Clock3 },
  { title: "Notes", href: "/notes", icon: BookOpenText },
  { title: "Graph", href: "/graph", icon: Network },
  { title: "Reports", href: "/reports", icon: ChartColumnBig },
  { title: "AI", href: "/ai", icon: Bot },
  { title: "Settings", href: "/settings", icon: Settings },
] as const;
