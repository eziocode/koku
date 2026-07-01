import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className, href = "/dashboard" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-3", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-sm shadow-primary/10">
        刻
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-wide text-foreground">Koku</span>
        <span className="text-xs tracking-[0.18em] text-muted-foreground">Minimal workspace</span>
      </span>
    </Link>
  );
}
