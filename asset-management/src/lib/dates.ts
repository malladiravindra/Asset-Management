/**
 * Date-only ("YYYY-MM-DD") helpers — the one place every module converts
 * between backend DateField strings and local Date objects.
 *
 * Never use `toISOString().slice(0, 10)` or `new Date("YYYY-MM-DD")` for
 * date-only values: toISOString() converts to UTC, so a local-midnight date
 * becomes the previous day east of UTC (e.g. India, UTC+5:30), and
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which is the previous
 * day west of UTC. These helpers stay in local time on both sides.
 */

/** Local calendar date → "YYYY-MM-DD" (no timezone conversion). */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → local-midnight Date for that calendar day. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
