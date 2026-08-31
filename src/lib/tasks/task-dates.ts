/**
 * Local-time helpers for the task create/edit form's date fields. Kept apart
 * from `tasks.ts` (which only ever writes UTC ISO strings) because these
 * exist purely to round-trip through `DateTimePicker`, whose value is a
 * local `"yyyy-MM-ddTHH:mm"` string, not an ISO instant.
 */

/** UTC ISO instant to the local `"yyyy-MM-ddTHH:mm"` string a DateTimePicker expects. */
export function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Right now, as a local `"yyyy-MM-ddTHH:mm"` string. */
export function nowLocalDateTime(): string {
  return toDateTimeLocal(new Date().toISOString());
}

/** Tomorrow at 23:59, as a local `"yyyy-MM-ddTHH:mm"` string. */
export function nextDayEndOfDayLocal(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);
  return toDateTimeLocal(tomorrow.toISOString());
}
