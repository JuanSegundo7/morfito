import type { Expense, ExpenseCategory, RecurringExpense } from "@/lib/types";
import { addDays, daysInMonth, formatCalendarDate, parseCalendarDate } from "@/lib/utils/calendar-date";

/**
 * gastos-recurrentes, PR2b. Pure, no React and no supabase imports — same
 * posture as lib/services/finance-summary.ts and lib/services/recipe-cost.ts,
 * so this can be unit tested in isolation (see recurring-expenses.test.ts).
 *
 * Two sections, one file (design D3): proration and payday tracking are the
 * two halves of ONE business rule (rule 1) — a non-monthly template
 * contributes exactly zero money and is instead tracked by cadence. Splitting
 * them into separate modules would let a future edit change one half's
 * "unconditional skip" into an `amount != null` check without ever seeing the
 * other, reintroducing the exact double-counting bug rule 1 exists to
 * prevent. Split trigger, if this ever needs revisiting: once this file
 * passes ~400 lines, or a third consumer needs payday tracking without
 * proration, extract lib/services/payday-progress.ts — the section boundary
 * below is already the seam.
 */

// ─── Proration (monthly templates) ─────────────────────────────────────────

/** One template's contribution on ONE calendar day. */
export interface DailyRecurringAllocation {
  date: string; // YYYY-MM-DD — joins directly to dailyData[].date
  amount: number; // template.amount / daysInMonth(THIS day's own month)
  category: ExpenseCategory;
  description: string;
  templateId: string;
}

/** One template's total contribution across the whole period. */
export interface RecurringExpenseAllocation {
  templateId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
}

/**
 * THE PRIMITIVE. Walks every calendar day in the overlap between each
 * template's [start_date, end_date] lifetime (end_date INCLUSIVE, NULL =
 * open-ended) and [periodStart, periodEnd], emitting one row per day at
 * `amount / daysInMonth(that day's own month)`.
 *
 * NOT amount / days-in-period, and NOT a 30-day average: a template active
 * across January and February contributes 31 days at amount/31 plus the
 * February days at amount/28 — each day is prorated against ITS OWN month's
 * length, never a single figure applied across the boundary.
 *
 * ONLY `monthly` templates produce rows. weekly/biweekly are skipped
 * UNCONDITIONALLY — never by testing `amount != null`. See scripts/047's
 * header: the one-off `expenses` row is the source of truth for those
 * payments, so a template that both prorated AND had a logged payment would
 * double-count the same money. A stale amount on a weekly row must still
 * contribute zero.
 *
 * periodStart/periodEnd MUST be UTC-midnight calendar dates from
 * parseCalendarDate — never arDateToUTC's AR-offset instants.
 */
export function expandRecurringExpensesDaily(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date,
): DailyRecurringAllocation[] {
  const allocations: DailyRecurringAllocation[] = [];

  for (const template of templates) {
    // Rule 1: non-monthly templates never contribute money, unconditionally.
    // Deliberately not `template.amount != null` — see the module header.
    if (template.frequency !== "monthly") {
      continue;
    }

    // A monthly template with a null amount prorates to a silent zero rather
    // than an error (design D10) — nothing to allocate, so skip early.
    if (template.amount == null) {
      continue;
    }

    const templateStart = parseCalendarDate(template.start_date);
    // end_date is INCLUSIVE (scripts/047) and NULL means still active — an
    // open-ended template is clamped to periodEnd for the overlap below.
    const templateEnd = template.end_date ? parseCalendarDate(template.end_date) : periodEnd;

    const overlapStart = templateStart > periodStart ? templateStart : periodStart;
    const overlapEnd = templateEnd < periodEnd ? templateEnd : periodEnd;

    if (overlapStart > overlapEnd) {
      // Entirely outside the requested period — no rows, not a zero-amount
      // row, no category entry.
      continue;
    }

    let cursor = overlapStart;
    while (cursor <= overlapEnd) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1; // daysInMonth is 1-indexed
      const dailyAmount = template.amount / daysInMonth(year, month);

      allocations.push({
        date: formatCalendarDate(cursor),
        amount: dailyAmount,
        category: template.category,
        description: template.description,
        templateId: template.id,
      });

      cursor = addDays(cursor, 1);
    }
  }

  return allocations;
}

/**
 * Per-template period totals, DERIVED by summing expandRecurringExpensesDaily's
 * output so the two can never disagree.
 *
 * Grouped by `templateId`, in first-seen order. NEVER by description or
 * category: two distinct templates can legitimately share both (two rent
 * lines for two locations), and merging them would erase the distinction the
 * "Fijos mensuales" list is built on.
 *
 * useOrdersAnalytics does NOT call this — it sums the daily primitive
 * directly (design D6). The consumer is the template list's per-template
 * "prorrateado este período" figure.
 */
export function expandRecurringExpenses(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date,
): RecurringExpenseAllocation[] {
  const daily = expandRecurringExpensesDaily(templates, periodStart, periodEnd);

  const order: string[] = [];
  const byTemplateId = new Map<string, RecurringExpenseAllocation>();

  for (const row of daily) {
    const existing = byTemplateId.get(row.templateId);

    if (existing) {
      existing.amount += row.amount;
      continue;
    }

    order.push(row.templateId);
    byTemplateId.set(row.templateId, {
      templateId: row.templateId,
      amount: row.amount,
      category: row.category,
      description: row.description,
    });
  }

  return order.map((templateId) => byTemplateId.get(templateId)!);
}

/**
 * Sum of an allocation array's amounts. Exists so the hook and the tests
 * agree on one reduction, and so `sum(daily) === sum(grouped)` is a
 * one-line assertion.
 */
export function sumAllocations(allocations: { amount: number }[]): number {
  return allocations.reduce((total, allocation) => total + allocation.amount, 0);
}

// ─── Payday tracking (weekly/biweekly templates) ───────────────────────────
//
// Section boundary, not a file boundary — see design D3. The two halves are
// the two halves of ONE rule: a non-monthly template contributes exactly zero
// money AND is instead tracked by cadence. The unconditional skip above and
// isInformationalPaydayTemplate below must never drift apart.

export interface PaydayProgress {
  loaded: number; // payments actually logged in the window
  expected: number; // paydays the cadence grid lands on in the window
}

const PAYDAY_INTERVAL_DAYS: Record<string, 7 | 15> = {
  weekly: 7,
  biweekly: 15,
};

/**
 * An ACTIVE weekly/biweekly template: declares a cadence, generates no money.
 *
 * Deliberately does NOT check `amount == null` — expandRecurringExpensesDaily
 * already skips every non-monthly template regardless of amount, so a row
 * carrying a leftover amount cannot double-count either way. Gating here on
 * `amount == null` would only make such a row invisible, with no upside.
 */
export function isInformationalPaydayTemplate(template: RecurringExpense): boolean {
  return template.frequency === "weekly" || template.frequency === "biweekly";
}

/**
 * Cadence grid dates inside [windowStart, windowEnd], both inclusive: every
 * `intervalDays` days from `startDate` as the anchor.
 *
 * MUST tolerate windowStart BEFORE the anchor (a template starting Aug 5
 * viewed through an Aug 1-31 window): clamp the first candidate to the anchor
 * itself, never assume daysSinceAnchor >= 0.
 */
export function previewPaydayDates(
  startDate: string,
  intervalDays: 7 | 15,
  windowStart: Date,
  windowEnd: Date,
): string[] {
  const anchor = parseCalendarDate(startDate);
  const dates: string[] = [];

  // The grid is anchor, anchor+interval, anchor+2*interval, ... regardless of
  // where windowStart falls. Starting the walk at the anchor itself — never
  // before it — is what keeps daysSinceAnchor from ever going negative when
  // windowStart precedes the template's own start_date.
  let cursor = anchor;
  while (cursor < windowStart) {
    cursor = addDays(cursor, intervalDays);
  }

  while (cursor <= windowEnd) {
    dates.push(formatCalendarDate(cursor));
    cursor = addDays(cursor, intervalDays);
  }

  return dates;
}

/**
 * "N de M pagos cargados" for ONE template inside a window.
 *
 * `loaded` counts expenses whose `recurring_expense_id === template.id`.
 * NEVER by description, NEVER filtered by category === "salaries": the FK
 * (scripts/047) replaces jebbs' description-string equality outright, so
 * renaming a template does not change its counter, and a weekly template in
 * ANY category is tracked.
 */
export function paydayProgressFor(
  template: RecurringExpense,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date,
): PaydayProgress {
  const startStr = formatCalendarDate(windowStart);
  const endStr = formatCalendarDate(windowEnd);

  const loaded = (expenses ?? []).filter(
    (expense) =>
      expense.recurring_expense_id === template.id &&
      expense.date >= startStr &&
      expense.date <= endStr,
  ).length;

  const intervalDays = PAYDAY_INTERVAL_DAYS[template.frequency];
  const expected = intervalDays
    ? previewPaydayDates(template.start_date, intervalDays, windowStart, windowEnd).length
    : 0;

  return { loaded, expected };
}

/**
 * Sum of paydayProgressFor over every informational template. Returns null
 * when there are none, so the caller can tell "no cadence templates
 * configured" (hide the counter) apart from "configured, zero paydays this
 * window" (show "0 de 0").
 */
export function aggregatePaydayProgress(
  templates: RecurringExpense[] | undefined,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date,
): PaydayProgress | null {
  const informational = (templates ?? []).filter(isInformationalPaydayTemplate);

  if (informational.length === 0) {
    return null;
  }

  return informational.reduce(
    (total, template) => {
      const progress = paydayProgressFor(template, expenses, windowStart, windowEnd);
      return {
        loaded: total.loaded + progress.loaded,
        expected: total.expected + progress.expected,
      };
    },
    { loaded: 0, expected: 0 },
  );
}
