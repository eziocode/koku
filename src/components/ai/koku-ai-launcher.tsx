"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { KokuAiPanel } from "@/components/ai/koku-ai-panel";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { cn } from "@/lib/utils";

const BUTTON_SIZE = 56;
const MARGIN = 12;

/**
 * Draggable floating launcher for Koku AI, in the corner of the app shell.
 * Pointer-events drag, matching the task board (see tasks-client.tsx): no
 * dependency on HTML5 drag-and-drop, which some hardened browsers disable.
 *
 * Only rendered when at least one AI connection has actually tested green
 * (`useAiKeys().verifiedConnections`) — an unconfigured or broken connection
 * should not put a chat bubble in front of the user.
 */
export function KokuAiLauncher() {
  const { verifiedConnections } = useAiKeys();
  const { value, patchValue } = useTypedSetting("kokuAi");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<{ x: number; y: number; id: number; startXFraction: number; startYFraction: number } | null>(null);
  const draggingRef = useRef(false);
  const [dragPosition, setDragPosition] = useState<{ xFraction: number; yFraction: number } | null>(null);

  // Reconciles a stale drag position after the window is resized, so the
  // launcher can never be stranded off the (possibly now-smaller) viewport.
  useEffect(() => {
    function handleResize() {
      setDragPosition((current) => current);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!verifiedConnections.length || value.dismissed) {
    return null;
  }

  const position = dragPosition ?? { xFraction: value.xFraction, yFraction: value.yFraction };
  const left = Math.min(
    Math.max(position.xFraction * window.innerWidth - BUTTON_SIZE / 2, MARGIN),
    window.innerWidth - BUTTON_SIZE - MARGIN,
  );
  const top = Math.min(
    Math.max(position.yFraction * window.innerHeight - BUTTON_SIZE / 2, MARGIN),
    window.innerHeight - BUTTON_SIZE - MARGIN,
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    pressRef.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      startXFraction: position.xFraction,
      startYFraction: position.yFraction,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!draggingRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    draggingRef.current = true;
    event.preventDefault();

    const xFraction = press.startXFraction + dx / window.innerWidth;
    const yFraction = press.startYFraction + dy / window.innerHeight;
    setDragPosition({
      xFraction: Math.min(Math.max(xFraction, 0), 1),
      yFraction: Math.min(Math.max(yFraction, 0), 1),
    });
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    if (press && event.currentTarget.hasPointerCapture(press.id)) {
      event.currentTarget.releasePointerCapture(press.id);
    }
    const wasDragging = draggingRef.current;
    pressRef.current = null;
    draggingRef.current = false;

    if (wasDragging && dragPosition) {
      void patchValue({ xFraction: dragPosition.xFraction, yFraction: dragPosition.yFraction });
      return;
    }

    if (!wasDragging) {
      setOpen((current) => !current);
    }
  }

  return (
    <div ref={containerRef} className="pointer-events-none fixed inset-0 z-40">
      {open ? (
        <div
          className="pointer-events-auto fixed"
          style={{ left: Math.min(left, window.innerWidth - 360 - MARGIN), top: Math.max(top - 520 - MARGIN, MARGIN) }}
        >
          <KokuAiPanel onClose={() => setOpen(false)} />
        </div>
      ) : null}

      <div
        className="pointer-events-auto fixed flex items-center gap-1"
        style={{ left, top }}
      >
        <div
          role="button"
          aria-label="Open Koku AI"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          className={cn(
            "flex h-14 w-14 cursor-grab select-none items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:cursor-grabbing",
          )}
          title="Koku AI"
        >
          刻
        </div>
        <button
          type="button"
          aria-label="Dismiss Koku AI"
          onClick={() => void patchValue({ dismissed: true })}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
