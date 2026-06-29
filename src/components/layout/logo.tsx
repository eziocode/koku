import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className, href = "/dashboard" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-3", className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20">
        刻
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-wide text-foreground">Koku</span>
        <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Work Intelligence
        </span>
      </span>
    </Link>
  );
}
