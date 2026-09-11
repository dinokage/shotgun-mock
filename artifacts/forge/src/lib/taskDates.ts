// 707 of the studio's 1066 imported tasks have no due date. `new Date(null)`
// is the Unix epoch, not an error, so an unguarded render showed "1/1/1970"
// and an unguarded comparison marked every one of those tasks overdue.

/** Parsed due date, or null when the task genuinely has none. */
export function parseDueDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Display string for a due date; `fallback` when there isn't one. */
export function formatDueDate(
  value: unknown,
  options?: Intl.DateTimeFormatOptions,
  fallback = "No due date",
): string {
  const d = parseDueDate(value);
  if (!d) return fallback;
  return options ? d.toLocaleDateString("en-US", options) : d.toLocaleDateString();
}

/** True only when a real due date exists and has passed. */
export function isOverdue(value: unknown, now: Date = new Date()): boolean {
  const d = parseDueDate(value);
  return d !== null && d < now;
}

/**
 * Sort comparator that keeps undated tasks at the end rather than sorting
 * them to the front as if they were due in 1970.
 */
export function byDueDate(a: unknown, b: unknown): number {
  const da = parseDueDate(a);
  const db = parseDueDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}
