import { describe, expect, it } from "vitest";
import { computeNetRevenue } from "@/lib/services/finance-summary";

/**
 * finanzas-gastos-recetas PR6. `computeNetRevenue` is the ONLY subtraction of
 * "ingreso neto" in the codebase (design.md D5) — these tests exist to make
 * the double-subtraction bug structurally impossible to reintroduce.
 *
 * `orders.total_amount` is already net of commission (use-create-order.ts's
 * `total = itemsTotal + priceAdjustment - discountAmount - commissionAmount +
 * delivery_fee`), so subtracting commission a second time here would
 * silently under-report net revenue. `commissionTotalInformational` is
 * display-only and must never move `netRevenue`.
 */
describe("computeNetRevenue", () => {
  it("6.2: netRevenue = totalRevenue - expensesTotal, NEVER also minus commission", () => {
    const result = computeNetRevenue({
      totalRevenue: 90,
      expensesTotal: 20,
      commissionTotalInformational: 10,
    });

    // The mandatory worked example: 90 - 20 = 70. NOT 60 (which would be
    // 90 - 20 - 10, i.e. commission double-subtracted).
    expect(result.netRevenue).toBe(70);
  });

  it("changing only commissionTotalInformational never moves netRevenue", () => {
    const base = computeNetRevenue({
      totalRevenue: 90,
      expensesTotal: 20,
      commissionTotalInformational: 10,
    });
    const withDifferentCommission = computeNetRevenue({
      totalRevenue: 90,
      expensesTotal: 20,
      commissionTotalInformational: 999,
    });

    expect(withDifferentCommission.netRevenue).toBe(base.netRevenue);
    expect(withDifferentCommission.netRevenue).toBe(70);
    // commissionTotal in the result still reflects the passthrough — it's
    // informational, not omitted.
    expect(withDifferentCommission.commissionTotal).toBe(999);
  });

  it("passes totalRevenue/expensesTotal through to the result unchanged", () => {
    const result = computeNetRevenue({
      totalRevenue: 1000,
      expensesTotal: 300,
      commissionTotalInformational: 150,
    });

    expect(result.totalRevenue).toBe(1000);
    expect(result.expensesTotal).toBe(300);
    expect(result.commissionTotal).toBe(150);
    expect(result.netRevenue).toBe(700);
  });

  it("2.16 (gastos-recurrentes PR2b): commission is never an operand, even once expensesTotal includes prorated recurring money", () => {
    // expensesTotal folds one-off (300) and prorated recurring (100) money
    // together BEFORE it ever reaches this function (design D6) — from
    // computeNetRevenue's point of view they are indistinguishable, which is
    // exactly the point: it must not need to know the money's origin.
    const result = computeNetRevenue({
      totalRevenue: 1000,
      expensesTotal: 300 + 100 /* prorated */,
      commissionTotalInformational: 150,
    });

    // 1000 - 400 = 600. Explicitly NOT 450 (which would be
    // 1000 - 400 - 150, i.e. commission double-subtracted).
    expect(result.netRevenue).toBe(600);
  });
});
