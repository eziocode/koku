"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CHECK_EVENT = "koku:check-app-update";

/** Ask mounted update indicator to check after an existing cloud request. */
export function checkForAppUpdate() {
  window.dispatchEvent(new Event(CHECK_EVENT));
}

async function fetchBuildVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/build-version.json?at=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { version?: unknown };
    return typeof payload.version === "string" && payload.version ? payload.version : null;
  } catch {
    return null;
  }
}

/** Shows only when an already-open tab detects a newer deployed build. */
export function AppUpdateIndicator() {
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let disposed = false;

    const check = async () => {
      const latestVersion = await fetchBuildVersion();
      if (disposed || !latestVersion) return;
      setLoadedVersion((currentVersion) => {
        if (currentVersion && currentVersion !== latestVersion) setUpdateAvailable(true);
        return currentVersion ?? latestVersion;
      });
    };

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener(CHECK_EVENT, check);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener(CHECK_EVENT, check);
    };
  }, []);

  if (!loadedVersion || !updateAvailable) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="New version available. Refresh now"
          className="border-primary/50 text-primary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Refresh for latest version</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>New version available, refresh</TooltipContent>
    </Tooltip>
  );
}
