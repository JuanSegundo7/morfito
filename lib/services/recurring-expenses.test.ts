import { describe, expect, it } from "vitest";
import type { Expense, RecurringExpense } from "@/lib/types";
import { dayBefore, parseCalendarDate } from "@/lib/utils/calendar-date";
import {
  aggregatePaydayProgress,
  expandRecurringExpenses,
  expandRecurringExpensesDaily,
  paydayProgressFor,
  previewPaydayDates,
  sumAllocations,
} from "@/lib/services/recurring-expenses";

/**
 * gastos-recurrentes, PR2b. Two describe sections mirror design D3's two
 * banner-delimited sections in recurring-expenses.ts: proration (monthly
 * templates) and payday tracking (weekly/biweekly templates). These are the
 * two halves of ONE rule (rule 1) — a non-monthly template contributes
 * exactly zero money and is instead tracked by cadence — so a bug that makes
 * one half drift from the other is exactly what several of these cases guard
 * against.
 */

function makeTemplate(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: "tmpl-default",
    amount: 1000,
    category: "rent",
    description: "Plantilla de prueba",
    frequency: "monthly",
    start_date: "2026-01-01",
    end_date: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-default",
    date: "2026-01-01",
    amount: 1000,
    category: "rent",
    description: null,
    supply_id: null,
    quantity: null,
    recurring_expense_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Proration (monthly templates) ─────────────────────────────────────────

describe("expandRecurringExpensesDaily", () => {
  it("2.7: crosses a month boundary — each day is prorated by ITS OWN month's length (rule 2)", () => {
    const template = makeTemplate({
      id: "tmpl-cross-month",
      amount: 31000,
      frequency: "monthly",
      start_date: "2026-01-15",
      end_date: "2026-02-15",
    });

    const result = expandRecurringExpensesDaily(
      [template],
      parseCalendarDate("2026-01-01"),
      parseCalendarDate("2026-02-28"),
    );

    const januaryRows = result.filter((row) => row.date.startsWith("2026-01"));
    const februaryRows = result.filter((row) => row.date.startsWith("2026-02"));

    // 17 January days (15..31) at 31000/31.
    expect(januaryRows).toHaveLength(17);
    for (const row of januaryRows) {
      expect(row.amount).toBeCloseTo(31000 / 31, 9);
    }

    // 15 February days (1..15) at 31000/28 — a DIFFERENT per-day figure,
    // never the January one applied across the boundary.
    expect(februaryRows).toHaveLength(15);
    for (const row of februaryRows) {
      expect(row.amount).toBeCloseTo(31000 / 28, 9);
    }

    const total = sumAllocations(result);
    const expectedTotal = 17 * (31000 / 31) + 15 * (31000 / 28);
    expect(total).toBeCloseTo(expectedTotal, 6);

    // Guard against the wrong shortcut: a flat amount/days-in-period (32
    // days total between 2026-01-15 and 2026-02-15 inclusive) would land on a
    // materially different total than the correct per-month proration above.
    const wrongFlatTotal = (31000 / 32) * 32;
    expect(total).not.toBeCloseTo(wrongFlatTotal, 2);
  });

  it("2.8: a weekly template contributes exactly zero, even with a non-null amount (rule 1)", () => {
    const template = makeTemplate({
      id: "tmpl-weekly",
      frequency: "weekly",
      amount: 500,
      start_date: "2026-05-01",
      end_date: null,
    });

    const result = expandRecurringExpensesDaily(
      [template],
      parseCalendarDate("2026-05-01"),
      parseCalendarDate("2026-05-31"),
    );

    expect(result).toEqual([]);
  });

  it("2.8: a biweekly template contributes exactly zero, even with a non-null amount (rule 1)", () => {
    const template = makeTemplate({
      id: "tmpl-biweekly",
      frequency: "biweekly",
      amount: 750,
      start_date: "2026-05-01",
      end_date: null,
    });

    const result = expandRecurringExpensesDaily(
      [template],
      parseCalendarDate("2026-05-01"),
      parseCalendarDate("2026-05-31"),
    );

    expect(result).toEqual([]);
  });

  it("2.9: sum(daily) and sum(grouped) agree within 1e-9, asserted with a tolerance — NEVER toBe", () => {
    const template = makeTemplate({
      id: "tmpl-31day",
      amount: 1000,
      frequency: "monthly",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    const periodStart = parseCalendarDate("2026-01-01");
    const periodEnd = parseCalendarDate("2026-01-31");

    const daily = expandRecurringExpensesDaily([template], periodStart, periodEnd);
    const grouped = expandRecurringExpenses([template], periodStart, periodEnd);

    expect(daily).toHaveLength(31);
    // 1000/31 summed 31 times does NOT equal 1000 exactly under float
    // arithmetic — this is exactly why the comparison below uses a
    // tolerance instead of toBe.
    expect(sumAllocations(daily)).not.toBe(1000);

    const dailySum = sumAllocations(daily);
    const groupedSum = sumAllocations(grouped);
    expect(Math.abs(dailySum - groupedSum)).toBeLessThan(1e-9);
  });

  it("2.10: end_date is inclusive — a template closed on the 15th contributes the 15th and NOT the 16th (rule 4)", () => {
    const template = makeTemplate({
      id: "tmpl-closed-15",
      amount: 3100,
      frequency: "monthly",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
    });

    const result = expandRecurringExpensesDaily(
      [template],
      parseCalendarDate("2026-03-01"),
      parseCalendarDate("2026-03-31"),
    );

    const dates = result.map((row) => row.date);
    expect(dates).toContain("2026-03-15");
    expect(dates).not.toContain("2026-03-16");
    expect(result).toHaveLength(15);
  });

  it("2.10: close-and-replace — the boundary day is charged exactly once, not zero, not twice (rule 4)", () => {
    const newStart = "2026-04-16";
    const closedEnd = dayBefore(newStart); // "2026-04-15"

    const oldTemplate = makeTemplate({
      id: "tmpl-old",
      amount: 1000,
      frequency: "monthly",
      start_date: "2026-04-01",
      end_date: closedEnd,
    });
    const newTemplate = makeTemplate({
      id: "tmpl-new",
      amount: 2000,
      frequency: "monthly",
      start_date: newStart,
      end_date: null,
    });

    const result = expandRecurringExpensesDaily(
      [oldTemplate, newTemplate],
      parseCalendarDate("2026-04-01"),
      parseCalendarDate("2026-04-30"),
    );

    const onClosedEnd = result.filter((row) => row.date === closedEnd);
    const onNewStart = result.filter((row) => row.date === newStart);

    expect(onClosedEnd).toHaveLength(1);
    expect(onClosedEnd[0].templateId).toBe("tmpl-old");
    expect(onNewStart).toHaveLength(1);
    expect(onNewStart[0].templateId).toBe("tmpl-new");
  });

  it("2.11: a template entirely outside the requested period produces no rows at all", () => {
    const template = makeTemplate({
      id: "tmpl-outside",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });

    const daily = expandRecurringExpensesDaily(
      [template],
      parseCalendarDate("2026-03-01"),
      parseCalendarDate("2026-03-31"),
    );
    const grouped = expandRecurringExpenses(
      [template],
      parseCalendarDate("2026-03-01"),
      parseCalendarDate("2026-03-31"),
    );

    expect(daily).toEqual([]);
    expect(grouped).toEqual([]);
  });

  it("3.10 (gastos-recurrentes PR3): zero templates produces zero allocations and a zero sum — the structural basis for PR3 being numerically a no-op", () => {
    // This is what use-orders-history.ts's queryFn actually calls with the
    // day the change ships: `recurring_expenses` is empty (nothing can
    // populate it until PR4), so `templates` is `[]` on every read.
    const daily = expandRecurringExpensesDaily(
      [],
      parseCalendarDate("2026-01-01"),
      parseCalendarDate("2026-01-31"),
    );

    expect(daily).toEqual([]);
    // sumAllocations reduces with an initial accumulator of 0, so an empty
    // array short-circuits to exactly 0 — never NaN, never undefined. This
    // is why `expensesTotal = oneOffExpensesTotal + sumAllocations([])` is
    // byte-identical to the pre-PR3 `expensesTotal = oneOffExpensesTotal`.
    expect(sumAllocations(daily)).toBe(0);
  });
});

describe("expandRecurringExpenses", () => {
  it("2.12: groups by templateId, NEVER by description or category", () => {
    const templateA = makeTemplate({
      id: "tmpl-a",
      amount: 1000,
      category: "rent",
      description: "Alquiler",
    });
    const templateB = makeTemplate({
      id: "tmpl-b",
      amount: 2000,
      category: "rent",
      description: "Alquiler",
    });

    const result = expandRecurringExpenses(
      [templateA, templateB],
      parseCalendarDate("2026-01-01"),
      parseCalendarDate("2026-01-31"),
    );

    expect(result).toHaveLength(2);
    const ids = result.map((row) => row.templateId).sort();
    expect(ids).toEqual(["tmpl-a", "tmpl-b"]);
  });
});

// ─── Payday tracking (weekly/biweekly templates) ───────────────────────────

describe("previewPaydayDates", () => {
  it("2.13: a window starting before the template's anchor is clamped, never negative", () => {
    const dates = previewPaydayDates(
      "2026-08-05",
      7,
      parseCalendarDate("2026-08-01"),
      parseCalendarDate("2026-08-31"),
    );

    expect(dates).toEqual(["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"]);
    expect(dates.every((date) => date >= "2026-08-05")).toBe(true);
  });
});

describe("paydayProgressFor", () => {
  it("2.14: matches ONLY by recurring_expense_id — never by category or description (rule 13)", () => {
    const template = makeTemplate({
      id: "tmpl-salary",
      frequency: "biweekly",
      amount: null,
      category: "salaries",
      description: "Sueldo empleado",
      start_date: "2026-06-01",
    });

    const matchingExpense = makeExpense({
      id: "expense-1",
      date: "2026-06-15",
      recurring_expense_id: "tmpl-salary",
      // Deliberately NOT "salaries" — the FK match must still count.
      category: "services",
      description: "Pago de sueldo",
    });

    const nonMatchingExpense = makeExpense({
      id: "expense-2",
      date: "2026-06-16",
      // No FK at all — must NOT count, even though the description matches
      // the template's own description exactly.
      recurring_expense_id: null,
      category: "salaries",
      description: "Sueldo empleado",
    });

    const progress = paydayProgressFor(
      template,
      [matchingExpense, nonMatchingExpense],
      parseCalendarDate("2026-06-01"),
      parseCalendarDate("2026-06-30"),
    );

    expect(progress.loaded).toBe(1);
  });
});

describe("aggregatePaydayProgress", () => {
  it("2.15: returns null (not {loaded: 0, expected: 0}) when zero informational templates exist", () => {
    const monthlyOnly = [makeTemplate({ frequency: "monthly", amount: 1000 })];

    const result = aggregatePaydayProgress(
      monthlyOnly,
      [],
      parseCalendarDate("2026-01-01"),
      parseCalendarDate("2026-01-31"),
    );

    expect(result).toBeNull();
  });

  it("2.15: returns a PaydayProgress when at least one informational template exists", () => {
    const templates = [
      makeTemplate({
        id: "tmpl-weekly",
        frequency: "weekly",
        amount: null,
        start_date: "2026-01-01",
      }),
    ];

    const result = aggregatePaydayProgress(
      templates,
      [],
      parseCalendarDate("2026-01-01"),
      parseCalendarDate("2026-01-31"),
    );

    expect(result).not.toBeNull();
  });
});
