/**
 * gastos-recurrentes, PR2a. Pure calendar-date arithmetic: a "calendar date"
 * here is a Date pinned to UTC MIDNIGHT with no time-of-day component, and a
 * "date string" is "YYYY-MM-DD".
 *
 * WHY THIS MODULE EXISTS
 * -------------------------------------------------------------------------
 * lib/hooks/orders/use-orders-history.ts computes its period bounds as
 * AR-LOCAL INSTANTS: arDateToUTC (:17-23) bakes a +3h offset into the UTC
 * value, so "2026-01-31" becomes 2026-01-31T03:00:00Z. Feeding that into
 * day-boundary proration math off-by-ones the edges of a month — the single
 * highest technical risk in this change. Proration inputs must be pure
 * calendar dates; this module is the only place they are produced.
 *
 * Every function below is deterministic. The one crossing from "an instant
 * on a clock" into calendar-date space, arTodayStr, takes the clock as a
 * DEFAULTED PARAMETER precisely so it stays testable at the AR-offset
 * boundary (23:00 AR is already tomorrow in UTC).
 *
 * Deliberately NOT reusing arDateToUTC: that function's +3h is exactly what
 * this module exists to keep out of the math.
 */

const AR_UTC_OFFSET_HOURS = 3;

/**
 * "YYYY-MM-DD" -> UTC-midnight Date. Never `new Date(str)`: that
 * constructor's timezone behaviour varies by engine and string form, which
 * poisons day counts.
 */
export function parseCalendarDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** UTC-midnight Date -> "YYYY-MM-DD". Inverse of parseCalendarDate. */
export function formatCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Days in `month` of `year`. NOTE: `month` is 1-INDEXED (1 = January),
 * unlike Date's own 0-indexed months — the implementation relies on that
 * (`Date.UTC(year, month, 0)` = last day of the 1-indexed month).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Calendar date `days` away from `date` (negative moves back). Safe as
 * plain millisecond arithmetic because every value here is UTC-midnight and
 * UTC has no DST — the same shift applied to a local-time Date would not be.
 */
export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/**
 * The calendar day before `dateStr`, as a string. THE close-and-replace
 * helper: end_date is INCLUSIVE (scripts/047), so closing a row on the
 * replacement's own start_date would charge that day twice.
 */
export function dayBefore(dateStr: string): string {
  return formatCalendarDate(addDays(parseCalendarDate(dateStr), -1));
}

/**
 * Today's calendar date in Argentina, as "YYYY-MM-DD". The single source of
 * "today" for the delete window (a template is deletable only while
 * start_date >= today) and for the expense dialog's default date. `now` is a
 * parameter so tests can pin the AR-offset boundary; production never passes
 * it.
 */
export function arTodayStr(now: Date = new Date()): string {
  const arInstant = new Date(now.getTime() - AR_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return formatCalendarDate(arInstant);
}
