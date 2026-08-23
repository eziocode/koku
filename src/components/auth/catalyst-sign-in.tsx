"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const LOGIN_DIV_ID = "catalyst-login-container";

declare global {
  interface Window {
    catalyst?: {
      auth: {
        signIn: (elementId: string, config?: Record<string, unknown>) => void;
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function CatalystSignIn() {
  const initialized = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function init() {
      try {
        await loadScript("https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js");
      } catch {
        console.error("[CatalystSignIn] Failed to load catalystWebSDK.js");
        setStatus("fallback");
        return;
      }

      try {
        await loadScript("/__catalyst/sdk/init.js");
      } catch {
        // Not on AppSail — use fallback link
        console.warn("[CatalystSignIn] /__catalyst/sdk/init.js not available (local dev?)");
        setStatus("fallback");
        return;
      }

      if (!window.catalyst?.auth?.signIn) {
        console.error("[CatalystSignIn] window.catalyst.auth.signIn not found after scripts loaded");
        setStatus("fallback");
        return;
      }

      setStatus("ready");
      window.catalyst.auth.signIn(LOGIN_DIV_ID, {});
    }

    init();
  }, []);

  if (status === "fallback") {
    const isLocal = typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    if (isLocal) {
      return (
        <p className="text-sm text-muted-foreground">
          Catalyst auth is not available in local dev. Deploy to AppSail to test sign-in.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Embedded auth unavailable. Sign in via the Zoho login page.
        </p>
        <Button asChild>
          <a href="/__catalyst/auth/login">Sign in with Zoho</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Loading sign-in…</p>
      )}
      <div id={LOGIN_DIV_ID} className="min-h-[360px] w-full" />
    </div>
  );
}
