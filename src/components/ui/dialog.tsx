"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * `hideClose` is for dialogs that must be answered rather than escaped — the
 * mandatory end-of-day setup, for one. Hiding the X is only half of it: the
 * caller also has to stop Esc and overlay clicks via `onEscapeKeyDown` /
 * `onPointerDownOutside`, since Radix owns those.
 */
/**
 * A pointerdown that lands outside the dialog's own DOM subtree is normally
 * treated as a dismiss. But a Radix `Select`/`Popover`/`DropdownMenu` nested
 * inside a dialog portals its content to `document.body`, and while open it
 * sets `pointer-events: none` on `body` (Radix's own modal-layering guard).
 * That style is removed asynchronously on close, so the very next pointerdown
 * — e.g. re-opening that same picklist — can land on `body` and get reported
 * as "outside" the dialog, closing it. Ignore outside-clicks that target one
 * of these portalled layers (or their remnants) instead.
 */
function isNestedOverlayTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  // A nested Select/Popover/DropdownMenu portal can unmount mid-click as it
  // closes; if it does, `target` is a detached node by the time this fires.
  // `.closest()`/`.contains()` on a detached node can't see the dialog's own
  // subtree either way, so treat "no longer in the document" as "not outside".
  if (!target.isConnected) return true;
  return Boolean(
    target.closest(
      "[data-radix-popper-content-wrapper], [role='listbox'], [role='menu'], [data-radix-portal]",
    ),
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, onPointerDownOutside, onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // pointer-events-auto!: a nested Select/DropdownMenu is modal in this
        // Radix version and has no opt-out. While open it treats this dialog's
        // portal as "other" content to hide from assistive tech, and that
        // hide-others pass sets an INLINE `pointer-events: none` directly on
        // both the overlay and this content — not just on `document.body` —
        // lifted only asynchronously on close. A plain class can't outrank an
        // inline style, so this needs the `!important` modifier: without it, a
        // click landing here during that window falls through to `<html>`,
        // which registers as a genuine outside click and closes the dialog
        // along with the picklist.
        // `max-h-[90vh]` + `overflow-y-auto`: a form with enough fields (or a
        // shorter/"mid-size" browser window) can be taller than the viewport.
        // Without a cap the fixed-centered dialog just extends past the top and
        // bottom edges with no way to scroll to what's cut off.
        "pointer-events-auto! fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl duration-200 sm:w-full",
        className,
      )}
      onPointerDownOutside={(event) => {
        if (isNestedOverlayTarget(event.target)) {
          event.preventDefault();
          return;
        }
        onPointerDownOutside?.(event);
      }}
      onInteractOutside={(event) => {
        if (isNestedOverlayTarget(event.target)) {
          event.preventDefault();
          return;
        }
        onInteractOutside?.(event);
      }}
      {...props}
    >
      {children}
      {hideClose ? null : (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/50">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
