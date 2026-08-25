/**
 * Catalyst DateTime columns accept a space-separated timestamp, not an ISO
 * 8601 string. Keep app records in ISO form and convert only at datastore IO.
 */
export function toCatalystDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;

  return new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}
