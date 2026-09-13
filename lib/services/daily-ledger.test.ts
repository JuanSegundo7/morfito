import { describe, expect, it } from "vitest";
import type { RecurringExpense } from "@/lib/types";
import { parseCalendarDate } from "@/lib/utils/calendar-date";
import {
  expandRecurringExpensesDaily,
  type DailyRecurringAllocation,
} from "@/lib/services/recurring-expenses";
import { computeNetRevenue } from "@/lib/services/finance-summary";
import {
  buildDailyLedger,
  LEDGER_DIRECTION,
  type LedgerDailyRevenue,
  type LedgerOneOffExpense,
} from "@/lib/services/daily-ledger";

/**
 * libro-diario, PR2, strict TDD. 13 RED cases (tasks 2.1-2.13), each pinning
 * one rule from spec.md's Domain 1 / design.md's D1, D2, D6, D7. This is the
 * repo's fourth pure module — see recurring-expenses.test.ts for the sibling
 * pattern this file follows.
 */

describe("buildDailyLedger", () => {
  it("2.1: row order within a day is Ventas -> Ingresos externos -> one-off expense -> prorated allocation (rule 2)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 50000, externalRevenue: 8000 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-09-10", amount: 3000, category: "supplies", description: "Insumos varios" },
    ];
    const recurringAllocations: DailyRecurringAllocation[] = [
      { date: "2026-09-10", amount: 10000, category: "rent", description: "Alquiler local", templateId: "tmpl-1" },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses, recurringAllocations });

    expect(ledger.map((entry) => entry.source)).toEqual([
      "orders",
      "external_income",
      "expense",
      "recurring",
    ]);
  });

  it("2.2: input order (expenses shuffled, allocations reversed) never changes the output — byte-identical, including every intermediate balance (design D7)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-14", ordersRevenue: 0, externalRevenue: 0 },
    ];
    // Mimics template-major output from an unordered select — the input
    // order the ledger builder must be indifferent to.
    const expensesInOrderA: LedgerOneOffExpense[] = [
      { date: "2026-09-14", amount: 1000, category: "supplies", description: "Zeta" },
      { date: "2026-09-14", amount: 2000, category: "services", description: "Alfa" },
    ];
    const expensesInOrderB = [...expensesInOrderA].reverse();

    const allocationsInOrderA: DailyRecurringAllocation[] = [
      { date: "2026-09-14", amount: 10000, category: "rent", description: "Alquiler", templateId: "tmpl-a" },
      { date: "2026-09-14", amount: 15000, category: "salaries", description: "Sueldos", templateId: "tmpl-b" },
    ];
    const allocationsInOrderB = [...allocationsInOrderA].reverse();

    const ledgerA = buildDailyLedger({
      dailyData,
      expenses: expensesInOrderA,
      recurringAllocations: allocationsInOrderA,
    });
    const ledgerB = buildDailyLedger({
      dailyData,
      expenses: expensesInOrderB,
      recurringAllocations: allocationsInOrderB,
    });

    // Byte-identical, including every intermediate `balance` — the
    // regression guard for the whole D7 decision.
    expect(ledgerB).toEqual(ledgerA);
    // Sorted by description first: "Alfa" before "Zeta", "Alquiler" before
    // "Sueldos" — never the input array's own order.
    expect(ledgerA.filter((e) => e.source === "expense").map((e) => e.concept)).toEqual([
      "Alfa",
      "Zeta",
    ]);
    expect(ledgerA.filter((e) => e.source === "recurring").map((e) => e.concept)).toEqual([
      "Alquiler",
      "Sueldos",
    ]);
  });

  it("2.3: Ventas and Ingresos externos are always two separate rows, never merged", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 45000, externalRevenue: 5000 },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses: [], recurringAllocations: [] });

    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({ source: "orders", amount: 45000 });
    expect(ledger[1]).toMatchObject({ source: "external_income", amount: 5000 });
  });

  it("2.4: rows with amount === 0 are excluded — no sales, a zero-amount allocation, a zero-amount expense, and an empty period all emit nothing (rule 4)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-05", ordersRevenue: 0, externalRevenue: 0 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-09-05", amount: 0, category: "supplies", description: null },
    ];
    const recurringAllocations: DailyRecurringAllocation[] = [
      { date: "2026-09-05", amount: 0, category: "rent", description: "Plantilla nula", templateId: "tmpl-zero" },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses, recurringAllocations });
    expect(ledger).toEqual([]);

    const emptyPeriodLedger = buildDailyLedger({ dailyData: [], expenses: [], recurringAllocations: [] });
    expect(emptyPeriodLedger).toEqual([]);
  });

  it("2.5: N active templates over M days produce N*M recurring rows, one per template per day, never collapsed (design D1)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-01", ordersRevenue: 0, externalRevenue: 0 },
      { date: "2026-09-02", ordersRevenue: 0, externalRevenue: 0 },
      { date: "2026-09-03", ordersRevenue: 0, externalRevenue: 0 },
    ];
    const templates = [
      { templateId: "tmpl-alquiler", description: "Alquiler", category: "rent" as const, amount: 10000 },
      { templateId: "tmpl-sueldos", description: "Sueldos", category: "salaries" as const, amount: 15000 },
      { templateId: "tmpl-servicios", description: "Servicios", category: "services" as const, amount: 5000 },
    ];
    const recurringAllocations: DailyRecurringAllocation[] = dailyData.flatMap((day) =>
      templates.map((template) => ({
        date: day.date,
        amount: template.amount,
        category: template.category,
        description: template.description,
        templateId: template.templateId,
      })),
    );

    const ledger = buildDailyLedger({ dailyData, expenses: [], recurringAllocations });
    const recurringRows = ledger.filter((entry) => entry.source === "recurring");

    // Never a single lumped "Gastos fijos" row, never merged by day.
    expect(recurringRows).toHaveLength(9);
    for (const day of dailyData) {
      const rowsThisDay = recurringRows.filter((entry) => entry.date === day.date);
      expect(rowsThisDay).toHaveLength(3);
      expect(new Set(rowsThisDay.map((entry) => entry.concept))).toEqual(
        new Set(["Alquiler", "Sueldos", "Servicios"]),
      );
    }
  });

  it("2.6: cross-month proration is passed through verbatim — the builder performs no division of its own", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-01-31", ordersRevenue: 0, externalRevenue: 0 },
      { date: "2026-02-01", ordersRevenue: 0, externalRevenue: 0 },
    ];
    const januaryRate = 31000 / 31;
    const februaryRate = 31000 / 28;
    const recurringAllocations: DailyRecurringAllocation[] = [
      { date: "2026-01-31", amount: januaryRate, category: "rent", description: "Alquiler", templateId: "tmpl-cross" },
      { date: "2026-02-01", amount: februaryRate, category: "rent", description: "Alquiler", templateId: "tmpl-cross" },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses: [], recurringAllocations });

    expect(ledger.find((entry) => entry.date === "2026-01-31")?.amount).toBe(januaryRate);
    expect(ledger.find((entry) => entry.date === "2026-02-01")?.amount).toBe(februaryRate);
  });

  it("2.7: a weekly/biweekly template contributes zero \"recurring\" rows anywhere, consistent with expandRecurringExpensesDaily's unconditional skip", () => {
    const staleWeeklyTemplate: RecurringExpense = {
      id: "tmpl-weekly-stale",
      amount: 500,
      category: "services",
      description: "Pago semanal (monto obsoleto)",
      frequency: "weekly",
      start_date: "2026-05-01",
      end_date: null,
      created_at: "2026-05-01T00:00:00Z",
    };

    // The real composition: expandRecurringExpensesDaily already skips
    // non-monthly templates unconditionally, so this array arrives empty —
    // asserted end-to-end through the builder, not mocked away.
    const recurringAllocations = expandRecurringExpensesDaily(
      [staleWeeklyTemplate],
      parseCalendarDate("2026-05-01"),
      parseCalendarDate("2026-05-31"),
    );
    expect(recurringAllocations).toEqual([]);

    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-05-15", ordersRevenue: 0, externalRevenue: 0 },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses: [], recurringAllocations });

    expect(ledger.filter((entry) => entry.source === "recurring")).toEqual([]);
  });

  it("2.8: no commission row exists, ever, even when commissionTotal is non-zero (design D1 / rule 9)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 200000, externalRevenue: 0 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-09-10", amount: 50000, category: "supplies", description: "Insumos" },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses, recurringAllocations: [] });

    // orders.total_amount is already net of commission (finance-summary.ts's
    // own header) — 48000 is informational-only and must NEVER appear as a
    // deduction anywhere in the ledger, even though it is non-zero here.
    const netRevenueResult = computeNetRevenue({
      totalRevenue: 200000,
      expensesTotal: 50000,
      commissionTotalInformational: 48000,
    });

    const income = ledger
      .filter((entry) => LEDGER_DIRECTION[entry.source] === "income")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const expense = ledger
      .filter((entry) => LEDGER_DIRECTION[entry.source] === "expense")
      .reduce((sum, entry) => sum + entry.amount, 0);

    // Tolerance, NEVER toBe — see 2.9 for why float accumulation drifts.
    expect(Math.abs(income - expense - netRevenueResult.netRevenue)).toBeLessThan(1e-9);

    for (const entry of ledger) {
      const concept = (entry.concept ?? "").toLowerCase();
      expect(concept).not.toContain("comisión");
      expect(concept).not.toContain("comision");
      expect(concept).not.toContain("commission");
      // Fails loudly if a fifth source (a commission row) is ever added to
      // LedgerSource.
      expect(["orders", "external_income", "expense", "recurring"]).toContain(entry.source);
    }
  });

  it("2.9: the running balance's last value differs from totalRevenue - expensesTotal by float drift, never re-summed for display (rule 1)", () => {
    const totalRevenue = 200000;
    const templateAmount = 100000;
    const dailyRate = templateAmount / 31;

    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-01-01", ordersRevenue: totalRevenue, externalRevenue: 0 },
    ];
    for (let day = 2; day <= 31; day++) {
      dailyData.push({ date: `2026-01-${String(day).padStart(2, "0")}`, ordersRevenue: 0, externalRevenue: 0 });
    }

    const recurringAllocations: DailyRecurringAllocation[] = dailyData.map((point) => ({
      date: point.date,
      amount: dailyRate,
      category: "rent",
      description: "Alquiler",
      templateId: "tmpl-31day",
    }));

    const ledger = buildDailyLedger({ dailyData, expenses: [], recurringAllocations });
    const expensesTotal = recurringAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const lastEntry = ledger.at(-1)!;
    // The number netRevenue would report, exactly: 200000 - 100000.
    const trueTotal = totalRevenue - templateAmount;

    // 31 float additions of 100000/31 do NOT reproduce 100000 exactly — this
    // is precisely the drift design D6 keeps off the "Saldo del período"
    // strip, which reads netRevenue directly instead.
    expect(lastEntry.balance).not.toBe(trueTotal);
    expect(Math.abs(lastEntry.balance - (totalRevenue - expensesTotal))).toBeLessThan(1e-9);
    expect(Math.abs(lastEntry.balance - trueTotal)).toBeGreaterThan(0);
    expect(Math.abs(lastEntry.balance - trueTotal)).toBeLessThan(1e-6);
  });

  it("2.10: buildDailyLedger's return carries no closing-balance field at all — there is no ledgerClosingBalance (design D6)", () => {
    const ledger = buildDailyLedger({
      dailyData: [{ date: "2026-09-10", ordersRevenue: 1000, externalRevenue: 0 }],
      expenses: [],
      recurringAllocations: [],
    });

    expect((ledger as unknown as Record<string, unknown>).closingBalance).toBeUndefined();
    expect((ledger as unknown as Record<string, unknown>).ledgerClosingBalance).toBeUndefined();
    // Only array-index own-properties exist — no aggregate total is ever
    // attached to the array itself.
    expect(Object.keys(ledger).every((key) => /^\d+$/.test(key))).toBe(true);
  });

  it("2.11: a null description survives as null — no Spanish fallback text is baked in by the builder (design D2)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 0, externalRevenue: 0 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-09-10", amount: 3000, category: "supplies", description: null },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses, recurringAllocations: [] });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].concept).toBeNull();
    expect(ledger[0].category).toBe("supplies");
    // The COMPONENT builds the "Gasto (Insumos)" fallback (PR3) — never this
    // module.
    expect(ledger[0].concept).not.toBe("Gasto (Insumos)");
  });

  it("2.12: direction is derived via LEDGER_DIRECTION, never stored — LedgerEntry has no kind and no isProrated key (design D2)", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 45000, externalRevenue: 5000 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-09-10", amount: 3000, category: "supplies", description: "Insumos" },
    ];
    const recurringAllocations: DailyRecurringAllocation[] = [
      { date: "2026-09-10", amount: 10000, category: "rent", description: "Alquiler", templateId: "tmpl-1" },
    ];

    const ledger = buildDailyLedger({ dailyData, expenses, recurringAllocations });

    for (const entry of ledger) {
      const expectedDirection =
        entry.source === "orders" || entry.source === "external_income" ? "income" : "expense";
      expect(LEDGER_DIRECTION[entry.source]).toBe(expectedDirection);
      expect("kind" in entry).toBe(false);
      expect("isProrated" in entry).toBe(false);
    }
  });

  it("2.13: an expense dated outside dailyData's walked range is ignored, not thrown", () => {
    const dailyData: LedgerDailyRevenue[] = [
      { date: "2026-09-10", ordersRevenue: 0, externalRevenue: 0 },
    ];
    const expenses: LedgerOneOffExpense[] = [
      { date: "2026-12-25", amount: 5000, category: "supplies", description: "Fuera de rango" },
    ];

    expect(() =>
      buildDailyLedger({ dailyData, expenses, recurringAllocations: [] }),
    ).not.toThrow();
    expect(buildDailyLedger({ dailyData, expenses, recurringAllocations: [] })).toEqual([]);
  });
});
