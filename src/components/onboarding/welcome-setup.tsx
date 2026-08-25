"use client";

import { Bell, CalendarDays, Clock3, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { explainUnsupported } from "@/lib/notifications/permission";
import { INTERVAL_PRESETS } from "@/lib/notifications/settings";
import { minutesToTimeInput, timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { parseSetting } from "@/lib/settings/schema";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { kokuDb } from "@/lib/storage/db";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { firstIncompleteWelcomeStep, getWelcomeStatus, type WelcomeStep } from "@/lib/onboarding/welcome-status";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const STEP_ORDER: WelcomeStep[] = ["displayName", "weekOff", "logoff", "notifications"];
const STEP_META = {
  displayName: { label: "Your profile", icon: UserRound },
  weekOff: { label: "Your week", icon: CalendarDays },
  logoff: { label: "Your day", icon: Clock3 },
  notifications: { label: "Your nudges", icon: Bell },
} satisfies Record<WelcomeStep, { label: string; icon: typeof UserRound }>;

export function WelcomeSetup() {
  const pathname = usePathname();
  const router = useRouter();
  const { value: displayName, setValue: setDisplayName } = useTypedSetting("displayName");
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission, request } = useNotificationPermission();
  const { patchValue: patchOnboarding } = useTypedSetting("onboarding");
  const row = useLiveQuery(() => kokuDb.settings.get("onboarding"), []);
  const onboarding = parseSetting("onboarding", row?.value);
  const loaded = row !== undefined;
  const status = useMemo(
    () => getWelcomeStatus(displayName, prefs, onboarding, permission),
    [displayName, onboarding, permission, prefs],
  );
  const firstStep = firstIncompleteWelcomeStep(status);
  const [step, setStep] = useState<WelcomeStep | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [weekDays, setWeekDays] = useState<number[]>(prefs.silentDays);
  const [logoffTime, setLogoffTime] = useState(prefs.endOfDay.logoffTime);
  const [interval, setInterval] = useState(String(prefs.checkIn.intervalMinutes));
  const [busy, setBusy] = useState(false);

  const activeStep = step !== null && !status[step] ? step : firstStep;
  const open = loaded && activeStep !== null;
  const stepIndex = activeStep ? STEP_ORDER.indexOf(activeStep) : 0;
  const meta = activeStep ? STEP_META[activeStep] : STEP_META.displayName;
  const Icon = meta.icon;

  useEffect(() => {
    if (loaded && !status.displayName && pathname !== "/settings/account") {
      router.replace("/settings/account");
    }
  }, [loaded, pathname, router, status.displayName]);

  function goBack() {
    const previous = STEP_ORDER.slice(0, stepIndex).reverse().find((candidate) => !status[candidate]);
    if (previous) setStep(previous);
  }

  async function saveStep() {
    if (!activeStep) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (activeStep === "displayName") {
        const value = nameDraft.trim();
        if (!value) {
          toast.error("Enter display name first.");
          return;
        }
        await setDisplayName(value);
        await patchOnboarding({ displayNameSetAt: now });
      } else if (activeStep === "weekOff") {
        await patch({ silentDays: weekDays });
        await patchOnboarding({ weekOffSetAt: now });
      } else if (activeStep === "logoff") {
        if (timeInputToMinutes(logoffTime) === null) {
          toast.error("Choose valid logoff time first.");
          return;
        }
        await patch({ endOfDay: { logoffTime } });
        await patchOnboarding({ endOfDaySetAt: now });
      } else {
        const selectedInterval = Number(interval);
        if (!Number.isInteger(selectedInterval) || selectedInterval < 5 || selectedInterval > 480) {
          toast.error("Choose reminder interval first.");
          return;
        }
        if (permission !== "granted") {
          const next = await request();
          if (next !== "granted") {
            toast.error("Allow browser notifications, then check again.");
            return;
          }
        }
        await patch({ checkIn: { intervalMinutes: selectedInterval, autoHideMinutes: 1 } });
        await patchOnboarding({ notificationsSetAt: now });
      }
      const next = STEP_ORDER.slice(stepIndex + 1).find((candidate) => !status[candidate]);
      setStep(next ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="max-w-2xl overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="grid sm:grid-cols-[11rem_1fr]">
          <aside className="bg-primary p-5 text-primary-foreground sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-70">Welcome to koku</p>
            <p className="mt-6 text-2xl font-semibold leading-tight">Set your rhythm.</p>
            <div className="mt-8 space-y-3">
              {STEP_ORDER.map((item, index) => {
                const ItemIcon = STEP_META[item].icon;
                const complete = status[item];
                return (
                  <div key={item} className="flex items-center gap-2 text-xs">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${complete ? "border-primary-foreground bg-primary-foreground text-primary" : item === activeStep ? "border-primary-foreground" : "border-primary-foreground/40 opacity-60"}`}>
                      {complete ? "✓" : <ItemIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className={item === activeStep ? "font-semibold" : "opacity-70"}>{index + 1}. {STEP_META[item].label}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="space-y-6 p-6 sm:p-8">
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <DialogTitle className="text-2xl">{activeStep === "displayName" ? "What should koku call you?" : activeStep === "weekOff" ? "Which days are yours?" : activeStep === "logoff" ? "When does your workday end?" : "How often should koku check in?"}</DialogTitle>
              <DialogDescription>
                {activeStep === "displayName" && "Personalize your workspace before you start logging time."}
                {activeStep === "weekOff" && "Choose your regular days off. You can also choose no week off."}
                {activeStep === "logoff" && "koku uses this time for its end-of-day reminder and timer safety check."}
                {activeStep === "notifications" && "Allow browser notifications so reminders can reach you while koku is open."}
              </DialogDescription>
            </DialogHeader>

            {activeStep === "displayName" ? (
              <div className="space-y-2">
                <Label htmlFor="welcome-display-name">Display name</Label>
                <Input id="welcome-display-name" autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="e.g. Alex" className="min-h-12" />
              </div>
            ) : null}

            {activeStep === "weekOff" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {WEEK_DAYS.map((label, day) => {
                    const selected = weekDays.includes(day);
                    return <button key={label} type="button" aria-pressed={selected} onClick={() => setWeekDays((current) => selected ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b))} className={`min-h-12 rounded-xl border text-sm font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 hover:bg-muted"}`}>{label}</button>;
                  })}
                </div>
                <button type="button" aria-pressed={weekDays.length === 0} onClick={() => setWeekDays([])} className={`rounded-xl border px-4 py-3 text-left text-sm ${weekDays.length === 0 ? "border-primary bg-primary/10" : "border-border"}`}>
                  <span className="font-medium">No week off</span><span className="ml-2 text-muted-foreground">I work every day</span>
                </button>
              </div>
            ) : null}

            {activeStep === "logoff" ? (
              <div className="space-y-2">
                <Label htmlFor="welcome-logoff-time">Average logoff time</Label>
                <Input id="welcome-logoff-time" type="time" autoFocus value={minutesToTimeInput(timeInputToMinutes(logoffTime) ?? 18 * 60)} onChange={(event) => setLogoffTime(event.target.value)} className="min-h-12 w-40" />
                <p className="text-xs text-muted-foreground">Change later in Settings → Notifications.</p>
              </div>
            ) : null}

            {activeStep === "notifications" ? (
              <div className="space-y-4">
                {support.supported ? (
                  <>
                    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                      {permission === "granted" ? "Notifications allowed. Pick your reminder rhythm." : "Browser permission required before koku can send reminders."}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="welcome-interval">Reminder interval</Label>
                      <Select value={interval} onValueChange={setInterval}>
                        <SelectTrigger id="welcome-interval" className="min-h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>{INTERVAL_PRESETS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>Every {minutes} minutes</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Notifications stay visible for 1 minute by default. Recurring check-ins stay off until you enable them in Settings.</p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">{explainUnsupported(support)} Use a browser with notification and service-worker support.</div>
                )}
                {permission === "denied" ? <p className="text-sm text-muted-foreground">Notifications are blocked at browser or OS level. Open browser site settings, allow notifications for koku, return here, then press “Check again”.</p> : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex gap-2">
                {stepIndex > 0 ? <Button variant="ghost" disabled={busy} onClick={goBack}>Back</Button> : null}
              </div>
              <DialogFooter>
                <Button disabled={busy || (activeStep === "notifications" && !support.supported)} onClick={() => void saveStep()}>{activeStep === "notifications" && permission !== "granted" ? "Allow and continue" : "Save and continue"}</Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
