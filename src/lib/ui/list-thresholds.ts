/**
 * Magic numbers shared by every picker, tag input, and manager list, so the
 * "when does search appear / how many rows fit" thresholds can't drift
 * between call sites.
 */

export const NONE_VALUE = "none";

export const COMBOBOX_SEARCH_THRESHOLD = 8;
export const COMBOBOX_PAGE_SIZE = 30;
export const COMBOBOX_MAX_ROWS = 8;
export const COMBOBOX_MAX_ROWS_COMPACT = 4;

export const MANAGER_SEARCH_THRESHOLD = 8;

export const TAG_VISIBLE_SUGGESTIONS = 8;
export const TAG_SEARCH_THRESHOLD = 12;
export const TAG_MAX_SUGGESTIONS = 60;
export const TAG_SCAN_LIMIT = 500;

export const TITLE_INDEX_LIMIT = 400;
export const TITLE_MIN_QUERY = 3;
export const TITLE_DEBOUNCE_MS = 200;

export function toNullableId(value: string): string | null {
  return value === NONE_VALUE ? null : value;
}

export function fromNullableId(value: string | null | undefined): string {
  return value ?? NONE_VALUE;
}
