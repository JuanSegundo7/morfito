import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * finanzas-gastos-recetas PR5. I/O layer over `expense_stock_movements`
 * (scripts/046-expense-stock-movements.sql) — the restock-side counterpart
 * of lib/hooks/supplies/use-order-stock-sync.ts's consumption-side ledger.
 * Deliberately placed beside that file (not under lib/hooks/expenses/) so a
 * reader comparing the two write orderings finds them adjacent. Same
 * pre-read/no-op/23505-swallow idempotency mechanics as
 * use-order-stock-sync.ts's applyDeductionPlan/reverseDeduction — but NOT a
 * step-by-step copy of that file's orderings, for the reason below.
 *
 * WRITE ORDERING — THE MIRROR, NOT A COPY
 * -------------------------------------------------------------------------
 * use-order-stock-sync.ts's header states its goal as "every failure mode is
 * biased toward UNDER-counting stock". An order movement CONSUMES stock
 * (apply => decrement); an expense movement RESTOCKS it (apply =>
 * increment) — the sign is inverted. Mechanically copying the order path's
 * step order would therefore invert the BIAS and produce OVER-counting
 * instead. Restating the goal as one direction-agnostic rule fixes this:
 *
 *   THE STOCK-LOWERING WRITE ALWAYS GOES FIRST;
 *   THE STOCK-RAISING WRITE ALWAYS GOES LAST.
 *
 * The four cases this produces (two shipped, two new here):
 *
 * | Path                    | Stock effect | Ordering                      | Crash-window outcome                                          |
 * |--------------------------|--------------|--------------------------------|----------------------------------------------------------------|
 * | Order apply (shipped)    | decrement    | decrement -> INSERT ledger     | under-counts (safe)                                             |
 * | Order reverse (shipped)  | increment    | DELETE ledger -> increment     | under-restores (safe)                                           |
 * | Expense apply (this file)| increment    | INSERT ledger -> increment     | stock not raised, ledger present => retry is a no-op => under-counts (safe) |
 * | Expense reverse (this file)| decrement  | decrement -> DELETE ledger     | stock lowered, ledger present => retry lowers again => under-counts (safe) |
 *
 * Because the expense-apply ledger INSERT now comes FIRST (before any stock
 * write happens at all), swallowing its 23505 is strictly safer than in the
 * order path: no increment has run yet when a collision is detected, so
 * there is no analogue of the order path's admitted "possible extra
 * decrement in that one narrow window".
 *
 * DELETE HAS A THIRD STEP, OWNED BY THE CALLER
 * -------------------------------------------------------------------------
 * `expense_stock_movements.expense_id` is ON DELETE CASCADE (046). If
 * lib/hooks/expenses/use-expenses.ts's useDeleteExpense deleted the
 * `expenses` row before calling reverseExpenseStockBump, the CASCADE would
 * silently erase the ledger row and the stock would never be decremented.
 * reverseExpenseStockBump therefore only does steps (1) decrement stock and
 * (2) delete the ledger row — the caller MUST delete the `expenses` row
 * itself, AFTER this resolves, never before.
 *
 * REVERSAL DOES NOT FLOOR AT ZERO — see 046's header / 041's "DELIBERATE
 * DESIGN CHOICES" note. Negative stock is a valid, meaningful state.
 */

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Inserts an `expense_stock_movements` row for (expenseId, supplyId) and
 * increments `supplies.stock_quantity` by `quantity`. Idempotent: a
 * pre-existing ledger row for this expense is a hard no-op (no re-increment,
 * no duplicate row), and a 23505 on the INSERT (concurrent retry) is
 * swallowed as already-applied. See this file's header for why the ledger
 * INSERT runs BEFORE the stock increment.
 */
export async function applyExpenseStockBump(
  supabase: SupabaseClient,
  expenseId: string,
  supplyId: string,
  quantity: number,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("expense_stock_movements")
    .select("id")
    .eq("expense_id", expenseId)
    .maybeSingle();

  if (existingError) throw existingError;

  // Hard no-op: this expense's bump was already applied (a genuine retry of
  // a previously-completed call). Zero additional increment, zero duplicate
  // ledger row.
  if (existing) return;

  const { error: insertError } = await supabase.from("expense_stock_movements").insert({
    expense_id: expenseId,
    supply_id: supplyId,
    quantity,
  });

  if (insertError) {
    // 23505 = unique_violation on (expense_id, supply_id) — a concurrent
    // request already committed this exact movement row. Treat as
    // already-applied, do NOT surface as an error to the calling mutation.
    // Safe here specifically because no stock write has happened yet (see
    // this file's header).
    if (insertError.code === "23505") return;
    throw insertError;
  }

  const { data: supply, error: supplyError } = await supabase
    .from("supplies")
    .select("stock_quantity")
    .eq("id", supplyId)
    .single();

  if (supplyError) throw supplyError;

  const { error: updateError } = await supabase
    .from("supplies")
    .update({ stock_quantity: (supply?.stock_quantity ?? 0) + quantity })
    .eq("id", supplyId);

  if (updateError) throw updateError;
}

/**
 * Reverses a previously-applied expense stock bump: decrements
 * `supplies.stock_quantity` by the ledger row's `quantity`, THEN deletes the
 * ledger row. No-op when no ledger row exists for this expense (bump was
 * never applied, or was already reversed). Does NOT delete the `expenses`
 * row itself — see this file's header, "DELETE HAS A THIRD STEP".
 */
export async function reverseExpenseStockBump(
  supabase: SupabaseClient,
  expenseId: string,
): Promise<void> {
  const { data: movement, error: selectError } = await supabase
    .from("expense_stock_movements")
    .select("supply_id, quantity")
    .eq("expense_id", expenseId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!movement) return;

  const { data: supply, error: supplyError } = await supabase
    .from("supplies")
    .select("stock_quantity")
    .eq("id", movement.supply_id)
    .single();

  if (supplyError) throw supplyError;

  // Deliberately no Math.max(0, ...) floor — see this file's header,
  // "REVERSAL DOES NOT FLOOR AT ZERO".
  const { error: updateError } = await supabase
    .from("supplies")
    .update({ stock_quantity: (supply?.stock_quantity ?? 0) - movement.quantity })
    .eq("id", movement.supply_id);

  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("expense_stock_movements")
    .delete()
    .eq("expense_id", expenseId);

  if (deleteError) throw deleteError;
}

/**
 * Invalidation companion, mirroring use-order-stock-sync.ts's
 * invalidateOrderStockQueries.
 */
export function invalidateExpenseStockQueries(queryClient: QueryClient, expenseId: string): void {
  queryClient.invalidateQueries({ queryKey: ["supplies"] });
  queryClient.invalidateQueries({ queryKey: ["all-supplies"] });
  queryClient.invalidateQueries({ queryKey: ["expense-stock-movements", expenseId] });
}
