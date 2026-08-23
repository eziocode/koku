"use client";

import { auditLogger } from "@/lib/audit/logger";
import {
  detectMiniPlayerCapabilities,
  isMiniPlayerSupported,
} from "@/lib/mini-player/feature-detection";
import {
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_WIDTH,
} from "@/lib/mini-player/settings";
import { transplantStyles, type StyleTransplant } from "@/lib/mini-player/style-transplant";

/**
 * The Picture-in-Picture window's lifecycle, deliberately outside React.
 *
 * React 19 runs StrictMode in development, which double-invokes effects. If
 * `requestWindow()` were called from an effect, dev would open the window, tear
 * it down on the cleanup pass, and then fail to reopen it — because the transient
 * user activation that the API requires was already spent on the first call.
 *
 * So the window lives in module state, `open` is idempotent, and React only
 * subscribes to the result. That makes a StrictMode remount a no-op rather than a
 * broken window.
 */

export type MiniPlayerWindowState =
  | { status: "closed" }
  | { status: "opening" }
  | { status: "open"; win: Window; mount: HTMLElement }
  | { status: "unsupported" }
  | { status: "error"; reason: MiniPlayerOpenFailure };

export type MiniPlayerOpenFailure = "unsupported" | "no-user-activation" | "unknown";

export const MINI_PLAYER_MOUNT_ID = "koku-mini-player-root";

const CLOSED: MiniPlayerWindowState = { status: "closed" };

const listeners = new Set<() => void>();
let state: MiniPlayerWindowState = CLOSED;
let transplant: StyleTransplant | null = null;
let detachOpener: (() => void) | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: MiniPlayerWindowState) {
  state = next;
  emit();
}

function teardown() {
  transplant?.dispose();
  transplant = null;
  detachOpener?.();
  detachOpener = null;
}

function handleClosed() {
  if (state.status === "closed") {
    return;
  }

  teardown();
  setState(CLOSED);
}

export interface OpenMiniPlayerOptions {
  width?: number;
  height?: number;
  /**
   * Don't surface a failure as `status: "error"`.
   *
   * Used by the automatic paths (tab switch, media-session auto-PiP), where the
   * user never asked for a window and a `NotAllowedError` is the *expected*
   * outcome on browsers that decline to open one unprompted. Reporting that as
   * an error would light up the pop-out button's failure toast for something
   * nobody did.
   */
  silent?: boolean;
}

/**
 * Opens the window, or focuses it if already open.
 *
 * MUST be called synchronously from a user-activated event handler, unless the
 * browser is invoking us through the media-session auto-PiP action.
 */
export async function openMiniPlayerWindow(
  options: OpenMiniPlayerOptions = {},
): Promise<MiniPlayerWindowState> {
  if (state.status === "open") {
    // Idempotent: this is what makes StrictMode remounts and double clicks safe.
    state.win.focus();
    return state;
  }

  if (state.status === "opening") {
    return state;
  }

  if (typeof window === "undefined" || !isMiniPlayerSupported(detectMiniPlayerCapabilities())) {
    setState({ status: "unsupported" });
    return state;
  }

  setState({ status: "opening" });

  /* Held outside the try so the catch can close a window that opened fine but
     then failed to be set up. Without this, a throw anywhere below leaves a real
     OS window on screen that React never portals into — a blank mini player that
     nothing owns and no close path reaches. */
  let opened: Window | null = null;

  try {
    const win = await window.documentPictureInPicture!.requestWindow({
      width: options.width ?? MINI_PLAYER_WIDTH,
      height: options.height ?? MINI_PLAYER_HEIGHT,
    });
    opened = win;

    transplant = transplantStyles(document, win.document);

    const mount = win.document.createElement("div");
    mount.id = MINI_PLAYER_MOUNT_ID;
    mount.tabIndex = -1;
    mount.setAttribute("role", "group");
    mount.setAttribute("aria-label", "Koku mini player");
    win.document.body.append(mount);

    // `pagehide` is the documented signal, and fires both when the user closes
    // the window from its own chrome and when the opener document is destroyed.
    // Guarded by the status check in `handleClosed`, so a double fire is a no-op.
    win.addEventListener("pagehide", handleClosed);
    win.addEventListener("unload", handleClosed);

    // Tear down deterministically if the opener tab is reloaded or navigated
    // away, rather than relying on the browser to notice.
    const onOpenerHide = () => closeMiniPlayerWindow();
    window.addEventListener("pagehide", onOpenerHide);
    detachOpener = () => window.removeEventListener("pagehide", onOpenerHide);

    setState({ status: "open", win, mount });

    // Focus the container (not a control): auto-focusing Stop would be
    // dangerous, and auto-focusing the note field would hijack typing. This just
    // makes the first Tab land somewhere predictable.
    void transplant.ready.then(() => mount.focus());

    return state;
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    // NotAllowedError means the user activation was missing or already consumed.
    const reason: MiniPlayerOpenFailure =
      name === "NotAllowedError" ? "no-user-activation" : "unknown";

    teardown();

    if (opened) {
      try {
        opened.close();
      } catch {
        /* already gone */
      }
    }

    auditLogger.event("mini-player.open.failed", "runtime", { error: name, reason });
    setState(options.silent ? CLOSED : { status: "error", reason });
    return state;
  }
}

export function closeMiniPlayerWindow(): void {
  if (state.status !== "open") {
    if (state.status !== "closed") {
      setState(CLOSED);
    }
    return;
  }

  const { win } = state;
  teardown();
  setState(CLOSED);

  try {
    win.close();
  } catch {
    /* already gone */
  }
}

export function subscribeMiniPlayerWindow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMiniPlayerWindowState(): MiniPlayerWindowState {
  return state;
}

/** Never open during server render. */
export function getMiniPlayerServerState(): MiniPlayerWindowState {
  return CLOSED;
}
