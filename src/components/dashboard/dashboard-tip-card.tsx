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
 *
 * Rotation holds only for reasons that actually concern the reader — the
 * pointer resting on the tip text, or keyboard focus inside the card. An
 * earlier version paused on hovering the card at all,
 * which froze the rotation for as long as the pointer happened to be resting
 * anywhere on this fairly large panel; in practice that meant it looked like it
 * never rotated at all.
 */
export function DashboardTipCard() {
  const [index, setIndex] = useState(0);

  // Two independent hold conditions, kept apart on purpose. Folded into one
  // `paused` boolean they clobber each other: leaving with the pointer would
  // clear a hold that keyboard focus had set, and vice versa.
  //
  // Tab visibility is deliberately *not* a hold. Browsers already throttle
  // background timers, and `document.hidden` reads permanently true in some
  // embedded hosts — holding on it there would freeze the rotation for good.
  const [textHovered, setTextHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  // Restarting the countdown after a manual shuffle. Without it, shuffling at
  // t=11s hands you a tip that swaps itself a second later.
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(pickRandomTipIndex());
  }, []);

  const advance = useCallback(() => {
    setIndex((current) => (current + 1) % DASHBOARD_TIPS.length);
  }, []);

  const shuffle = useCallback(() => {
    advance();
    setCycle((current) => current + 1);
  }, [advance]);

  const held = textHovered || focusWithin;

  useEffect(() => {
    if (held) {
      return;
    }

    const id = window.setInterval(advance, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [advance, held, cycle]);

  const tip = DASHBOARD_TIPS[index % DASHBOARD_TIPS.length];

  return (
    <Card
      className="minimal-panel"
      // Keyboard focus anywhere in the card holds the tip: someone tabbing to
      // the action link should still find it there when they press Enter.
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={() => setFocusWithin(false)}
    >
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
      <CardContent className="space-y-3 pt-0">
        {/* aria-live so the rotation is announced rather than silently swapped.
            The hold is scoped to this paragraph — swapping text out from under
            the pointer that is tracking it is the hostile case, and it is the
            only one worth freezing the whole rotation for. */}
        <p
          aria-live="polite"
          className="text-sm leading-relaxed text-foreground"
          onMouseEnter={() => setTextHovered(true)}
          onMouseLeave={() => setTextHovered(false)}
        >
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
