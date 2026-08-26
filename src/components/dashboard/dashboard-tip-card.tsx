"use client";

import { ArrowRight, Lightbulb, Shuffle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { DASHBOARD_TIPS, pickRandomTipIndex } from "@/lib/dashboard/tips";

/** How long one tip stays up before the next rotates in. */
const ROTATE_MS = 12_000;

/**
 * Rotating discovery tip.
 *
 * Replaces the old "Quick action — Start a timer below" card, which pointed at a
 * button already visible underneath it. The starting tip is randomised in an
 * effect rather than during render: picking it in render would differ between
 * the server and client pass and warn as a hydration mismatch.
 */
export function DashboardTipCard() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(pickRandomTipIndex());
  }, []);

  const next = useCallback(() => {
    setIndex((current) => (current + 1) % DASHBOARD_TIPS.length);
  }, []);

  useEffect(() => {
    if (paused) {
      return;
    }

    const id = window.setInterval(next, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [next, paused]);

  const tip = DASHBOARD_TIPS[index % DASHBOARD_TIPS.length];

  return (
    <Card
      className="minimal-panel"
      // Rotating text under the reader's cursor is hostile, so hovering — and
      // keyboard focus, for the same reason — holds the current tip in place.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            {tip.area}
          </span>
          <button
            type="button"
            onClick={next}
            aria-label="Show another tip"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* aria-live so the rotation is announced rather than silently swapped. */}
        <p aria-live="polite" className="text-sm leading-relaxed text-foreground">
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
