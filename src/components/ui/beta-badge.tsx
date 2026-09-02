import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a surface as still in beta. One component so every AI surface says it
 * the same way and the wording can be changed in one place when it ships.
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-primary/30 bg-primary/5 px-2 py-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary",
        className,
      )}
    >
      Beta
    </Badge>
  );
}
