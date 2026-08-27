"use client";

import { ArrowRight, Lightbulb, Shuffle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { DASHBOARD_TIPS, pickRandomTipIndex } from "@/lib/dashboard/tips";

/**
 * Discovery tip, picked once per page load.
 *
 * Replaces the old "Quick action — Start a timer below" card, which pointed at a
 * button already visible underneath it. The starting tip is randomised in an
 * effect rather than during render: picking it in render would differ between
 * the server and client pass and warn as a hydration mismatch.
 *
 * No auto-rotation: the tip only changes on a fresh page load or a manual
 * shuffle click. An earlier version rotated on a timer, which meant the text
 * — and therefore the card's height — could change under a reader mid-read.
 */
export function DashboardTipCard() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(pickRandomTipIndex());
  }, []);

  const shuffle = useCallback(() => {
    setIndex((current) => (current + 1) % DASHBOARD_TIPS.length);
  }, []);

  const tip = DASHBOARD_TIPS[index % DASHBOARD_TIPS.length];

  return (
    <Card className="minimal-panel">
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            {tip.area}
          </span>
          <button
            type="button"
            onClick={shuffle}
            aria-label="Show another tip"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
        </CardDescription>
      </CardHeader>
      {/* Fixed height + clamp so a longer/shorter tip never resizes the card
          under the reader — only the text inside reflows. */}
      <CardContent className="space-y-3 pt-0">
        <p aria-live="polite" className="line-clamp-4 min-h-[5rem] text-sm leading-relaxed text-foreground">
          {tip.text}
        </p>
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2 text-primary">
          <Link href={tip.href}>
            {tip.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
