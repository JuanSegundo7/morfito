/**
 * finanzas-gastos-recetas PR6. Pure functions only — no supabase/react
 * imports, same posture as lib/services/recipe-cost.ts, so this can be unit
 * tested in isolation (see finance-summary.test.ts).
 *
 * THIS MODULE EXISTS FOR EXACTLY ONE REASON: to be the SINGLE place net
 * revenue is computed, so a double-subtraction bug cannot be reintroduced by
 * a second call site.
 *
 * COMMISSION IS ALREADY NETTED OUT OF orders.total_amount.
 * -------------------------------------------------------------------------
 * lib/hooks/orders/use-create-order.ts persists
 *   total_amount = itemsTotal + priceAdjustment - discountAmount
 *                  - commissionAmount + delivery_fee
 * so every SUM(orders.total_amount) — including useOrdersAnalytics'
 * `totalRevenue` — is ALREADY net of commission. Subtracting
 * SUM(orders.commission_amount) from it here would deduct the same money
 * twice and silently under-report the operator's net revenue.
 *
 * commissionTotal is therefore INFORMATIONAL ONLY: an "así se repartió" line
 * the Resumen tab displays so the operator can see how much the channels
 * took, NOT an operand in netRevenue. Its input field is named
 * `commissionTotalInformational` precisely so that anyone reaching for it in
 * an arithmetic expression has to first ignore what the field's own name is
 * telling them.
 */

export interface NetRevenueInput {
  /** SUM of completed orders' total_amount + external_income.amount, for the
   *  period. Already net of commission — see this module's header. */
  totalRevenue: number;
  /** SUM of expenses.amount for the period. */
  expensesTotal: number;
  /** SUM of orders.commission_amount for the period. DISPLAY ONLY. Passing a
   *  wrong value here cannot affect netRevenue — that is the point. */
  commissionTotalInformational: number;
}

export interface NetRevenueResult {
  totalRevenue: number;
  expensesTotal: number;
  /** Passed straight through from the input. Never an operand. */
  commissionTotal: number;
  /** THE formula. One subtraction, one place, whole codebase. */
  netRevenue: number;
}

export function computeNetRevenue(input: NetRevenueInput): NetRevenueResult {
  return {
    totalRevenue: input.totalRevenue,
    expensesTotal: input.expensesTotal,
    commissionTotal: input.commissionTotalInformational,
    netRevenue: input.totalRevenue - input.expensesTotal,
  };
}
