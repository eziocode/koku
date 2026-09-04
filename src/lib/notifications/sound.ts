/**
 * Reminder sound-fx. Built on the Web Audio API rather than an `<audio>`
 * asset — a two-tone beep needs no binary to ship, license, or keep in sync
 * with the app's theme, and this is the only sound koku ever plays.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }

  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new Ctor();
  }

  return sharedContext;
}

function beep(context: AudioContext, startAt: number, frequency: number, durationSec: number, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  // Ramp in/out instead of a hard on/off, so the beep doesn't click.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
}

/** Plays the reminder chime at `volume` (0-1). No-ops if audio isn't available. */
export function playReminderChime(volume: number): void {
  const context = getContext();
  if (!context) {
    return;
  }

  const clampedVolume = Math.min(1, Math.max(0, volume));
  if (clampedVolume === 0) {
    return;
  }

  void context.resume();

  const now = context.currentTime;
  beep(context, now, 880, 0.15, clampedVolume);
  beep(context, now + 0.18, 1175, 0.2, clampedVolume);
}

/** Seconds between the start of one chime and the next while an alarm repeats. */
const ALARM_REPEAT_INTERVAL_SEC = 1;

/**
 * Repeats the reminder chime once a second until the caller stops it (the
 * user responded) or `maxDurationSec` elapses, whichever comes first — so a
 * reminder demands attention instead of a single beep that's easy to miss.
 * Returns a stop function; safe to call more than once.
 */
export function startReminderAlarm(volume: number, maxDurationSec: number): () => void {
  const context = getContext();
  const clampedVolume = Math.min(1, Math.max(0, volume));
  if (!context || clampedVolume === 0) {
    return () => {};
  }

  void context.resume();

  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const startedAt = context.currentTime;

  const ring = () => {
    if (stopped) {
      return;
    }

    if (context.currentTime - startedAt >= maxDurationSec) {
      stopped = true;
      return;
    }

    const now = context.currentTime;
    beep(context, now, 880, 0.15, clampedVolume);
    beep(context, now + 0.18, 1175, 0.2, clampedVolume);
    timeoutId = setTimeout(ring, ALARM_REPEAT_INTERVAL_SEC * 1000);
  };

  ring();

  return () => {
    stopped = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}
