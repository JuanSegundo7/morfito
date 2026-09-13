import type { Expense, ExpenseCategory } from "@/lib/types";
import type { DailyRecurringAllocation } from "@/lib/services/recurring-expenses";

/**
 * libro-diario, PR2. Pure: no React, no supabase, no `components/` import —
 * same posture as finance-summary.ts, recipe-cost.ts and
 * recurring-expenses.ts. This is the repo's fourth tested pure module (see
 * daily-ledger.test.ts).
 *
 * PROJECTS one period's money movements — `dailyData` (sales/external
 * income per day), the period's one-off `expenses`, and the single
 * `recurringAllocations` array `gastos-recurrentes` D6 established — into a
 * chronological debit/credit ledger with a running balance. Adds NO new
 * data: everything here is already in memory in useOrdersAnalytics'
 * `queryFn` by the time this is called.
 */

/**
 * WHERE A ROW CAME FROM — and, through LEDGER_DIRECTION below, which column
 * it lands in. The ONE discriminator: `kind`/`isProrated` are deliberately
 * NOT stored, because both are functions of this field and a second stored
 * field is a second thing a builder edit can get wrong (design D2).
 *
 * There is NO commission source, in any form. orders.total_amount is
 * already net of commission (lib/services/finance-summary.ts's header), so
 * a commission row would deduct the same money twice. See the proposal's D1.
 */
export type LedgerSource = "orders" | "external_income" | "expense" | "recurring";

/**
 * Object literal, not Object.fromEntries: TS checks all four keys against
 * the union HERE, so adding a fifth source is a compile error at this exact
 * line — same posture as use-orders-history.ts's expensesByCategory.
 */
export const LEDGER_DIRECTION: Record<LedgerSource, "income" | "expense"> = {
  orders: "income",
  external_income: "income",
  expense: "expense",
  recurring: "expense",
};

export interface LedgerEntry {
  /** YYYY-MM-DD, AR calendar date. Joins directly to dailyData[].date. */
  date: string;
  /** Provenance AND direction (via LEDGER_DIRECTION). The `prorrateo` badge
   *  is `source === "recurring"` — never a stored boolean. */
  source: LedgerSource;
  /** ONLY text the DATA carries: a one-off expense's description, or a
   *  template's (NOT NULL in scripts/047). null for "orders"/
   *  "external_income" aggregate rows AND for an expense whose description
   *  is null — the COMPONENT resolves every Spanish label, including the
   *  `Gasto (${EXPENSE_CATEGORY_LABELS[category]})` fallback (design D2). */
  concept: string | null;
  /** Set for both expense sources; null for income rows. Its only consumer
   *  is the null-description fallback label. */
  category: ExpenseCategory | null;
  /** ALWAYS the source's own magnitude — never negated. Direction is
   *  carried by `source` alone; the component never flips a sign. */
  amount: number;
  /** Running balance WITHIN the visible period, opening at 0. A narrative
   *  aid, NEVER the displayed total: the "Saldo del período" strip reads
   *  netRevenue (design D6, rule 1). Float drift between this column's last
   *  value and netRevenue is expected and must never be surfaced. */
  balance: number;
}

/** The minimum of dailyData the builder reads. DailyAnalyticsPoint
 *  (use-orders-history.ts) is structurally assignable to it — declared
 *  here rather than imported so lib/services/ never depends on lib/hooks/
 *  (design D4). */
export interface LedgerDailyRevenue {
  date: string;
  ordersRevenue: number;
  externalRevenue: number;
}

/** Exactly the columns the current-period expenses select must return.
 *  `description` is the one PR1 added. Note the supabase client carries no
 *  Database generic (lib/supabase/client.ts), so the select is NOT
 *  type-checked — this alias is the first place the shape is asserted, and
 *  the caller coerces `description` with `?? null` at the boundary because
 *  a missing column arrives as `undefined`, not null. */
export type LedgerOneOffExpense = Pick<Expense, "date" | "amount" | "category" | "description">;

/** Plain code-unit comparison, never localeCompare — locale-dependent
 *  collation would make a unit test's expected order depend on the machine
 *  running it (design D7). */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** nulls-last, then amount, then category (design D7). A full tie means the
 *  two rows are byte-identical, so output is deterministic regardless. */
function compareOneOffExpenses(a: LedgerOneOffExpense, b: LedgerOneOffExpense): number {
  if (a.description === null && b.description !== null) return 1;
  if (a.description !== null && b.description === null) return -1;
  if (a.description !== null && b.description !== null) {
    const byDescription = compareStrings(a.description, b.description);
    if (byDescription !== 0) return byDescription;
  }

  const byAmount = a.amount - b.amount;
  if (byAmount !== 0) return byAmount;

  return compareStrings(a.category, b.category);
}

/** description, then templateId — templateId is a UUID, unique by
 *  construction, so the order is total (design D7). */
function compareAllocations(a: DailyRecurringAllocation, b: DailyRecurringAllocation): number {
  const byDescription = compareStrings(a.description, b.description);
  if (byDescription !== 0) return byDescription;

  return compareStrings(a.templateId, b.templateId);
}

/**
 * Projects one period's money movements into a chronological debit/credit
 * ledger with a running balance. PURE: no fetching, no clock, no arithmetic
 * beyond accumulation — every amount is passed through from its source.
 *
 * ORDER (rule 2, deterministic and reproducible across renders):
 *   walk `dailyData` in its own order — it was built by advancing a cursor
 *   from start to end one day at a time (use-orders-history.ts), so
 *   chronology is inherited, never re-derived and never sorted; then per day
 *     1. "orders"          — one aggregate row, if ordersRevenue !== 0
 *     2. "external_income" — one aggregate row, if externalRevenue !== 0
 *     3. "expense"         — one row per one-off expense, sorted by
 *                            (description nulls-last, amount, category)
 *     4. "recurring"       — one row per template (design D1 — NEVER
 *                            collapsed), sorted by (description, templateId)
 *
 * The two sorts are load-bearing, not cosmetic: expandRecurringExpensesDaily
 * emits TEMPLATE-major order from a query with no ORDER BY, so without them
 * the intermediate balances reshuffle between refetches (design D7).
 *
 * Rows with amount === 0 are skipped entirely (rule 4) — the ledger shows
 * movements, not a calendar. A day outside dailyData's range cannot occur
 * (both key spaces derive from [startDateStr, endDateStr]); if one ever
 * did, its rows are ignored rather than appended — this function never
 * walks `expenses`/`recurringAllocations` independently, only by looking
 * them up for a date already present in `dailyData`.
 *
 * The caller does NOT get a total from here. See design D6.
 */
export function buildDailyLedger(input: {
  dailyData: readonly LedgerDailyRevenue[];
  expenses: readonly LedgerOneOffExpense[];
  recurringAllocations: readonly DailyRecurringAllocation[];
}): LedgerEntry[] {
  const expensesByDate = new Map<string, LedgerOneOffExpense[]>();
  for (const expense of input.expenses) {
    const bucket = expensesByDate.get(expense.date);
    if (bucket) {
      bucket.push(expense);
    } else {
      expensesByDate.set(expense.date, [expense]);
    }
  }

  const allocationsByDate = new Map<string, DailyRecurringAllocation[]>();
  for (const allocation of input.recurringAllocations) {
    const bucket = allocationsByDate.get(allocation.date);
    if (bucket) {
      bucket.push(allocation);
    } else {
      allocationsByDate.set(allocation.date, [allocation]);
    }
  }

  const entries: LedgerEntry[] = [];
  let balance = 0;

  const push = (entry: Omit<LedgerEntry, "balance">) => {
    balance += LEDGER_DIRECTION[entry.source] === "income" ? entry.amount : -entry.amount;
    entries.push({ ...entry, balance });
  };

  for (const day of input.dailyData) {
    if (day.ordersRevenue !== 0) {
      push({ date: day.date, source: "orders", concept: null, category: null, amount: day.ordersRevenue });
    }
    if (day.externalRevenue !== 0) {
      push({
        date: day.date,
        source: "external_income",
        concept: null,
        category: null,
        amount: day.externalRevenue,
      });
    }

    const oneOffExpenses = expensesByDate.get(day.date);
    if (oneOffExpenses) {
      const sorted = [...oneOffExpenses].sort(compareOneOffExpenses);
      for (const expense of sorted) {
        if (expense.amount === 0) continue;
        push({
          date: day.date,
          source: "expense",
          concept: expense.description,
          category: expense.category,
          amount: expense.amount,
        });
      }
    }

    const allocations = allocationsByDate.get(day.date);
    if (allocations) {
      const sorted = [...allocations].sort(compareAllocations);
      for (const allocation of sorted) {
        if (allocation.amount === 0) continue;
        push({
          date: day.date,
          source: "recurring",
          concept: allocation.description,
          category: allocation.category,
          amount: allocation.amount,
        });
      }
    }
  }

  return entries;
}
