"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const LOGIN_DIV_ID = "catalyst-login-container";

declare global {
  interface Window {
    catalyst?: { auth: { signIn: (elementId: string, config?: Record<string, unknown>) => void } };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement("script"); script.src = src;
    script.onload = () => resolve(); script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function CatalystSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const initialized = useRef(false);
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => { onSignedInRef.current = onSignedIn; }, [onSignedIn]);

  useEffect(() => {
    if (!open || initialized.current) return;
    initialized.current = true;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    async function init() {
      try {
        await loadScript("https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js");
        await loadScript("/__catalyst/sdk/init.js");
      } catch {
        if (!cancelled) setStatus("fallback");
        return;
      }
      if (!window.catalyst?.auth?.signIn) { if (!cancelled) setStatus("fallback"); return; }
      if (cancelled) return;
      setStatus("ready");
      window.catalyst.auth.signIn(LOGIN_DIV_ID, {});
      poll = setInterval(async () => {
        try {
          const response = await fetch("/api/auth/me", { cache: "no-store" });
          const body = await response.json() as { user?: unknown | null };
          if (body.user) { clearInterval(poll); close(); onSignedInRef.current?.(); }
        } catch { /* Keep login open while auth callback settles. */ }
      }, 700);
    }
    void init();
    return () => { cancelled = true; if (poll) clearInterval(poll); };
  }, [open]);

  function close() { setOpen(false); setStatus("loading"); initialized.current = false; }
  const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  return <Dialog open={open} onOpenChange={(next) => next ? setOpen(true) : close()}>
    <DialogTrigger asChild><Button>Sign in with Zoho</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader><DialogTitle>Sign in to Koku</DialogTitle><DialogDescription>Use your Zoho account to sync data across devices.</DialogDescription></DialogHeader>
      {status === "loading" && <p className="text-sm text-muted-foreground">Loading sign-in…</p>}
      {status === "fallback" ? isLocal ? <p className="text-sm text-muted-foreground">Catalyst auth unavailable in local development. Deploy to AppSail to test sign-in.</p> : <Button asChild><a href="/__catalyst/auth/login">Continue to Zoho sign-in</a></Button> : null}
      <div id={LOGIN_DIV_ID} className="w-full overflow-hidden" />
    </DialogContent>
  </Dialog>;
}
