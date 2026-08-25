/**
 * Catalyst DateTime columns accept a space-separated timestamp, not an ISO
 * 8601 string. Keep app records in ISO form and convert only at datastore IO.
 */
export function toCatalystDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;

  // Avoid shifting values already returned by Catalyst through server timezone.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return fromCatalystDateTime(value) ? value : null;
  }

  if (!Number.isFinite(Date.parse(value))) return null;

  return new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

/** Convert Catalyst's UTC DateTime representation back to app ISO form. */
export function fromCatalystDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  if (!Number.isFinite(Date.parse(normalized))) return null;
  return new Date(normalized).toISOString();
}
