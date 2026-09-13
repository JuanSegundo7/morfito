"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { arTodayStr, dayBefore } from "@/lib/utils/calendar-date";
import type { ExpenseCategory, RecurringExpense, RecurringExpenseFrequency } from "@/lib/types";

/**
 * gastos-recurrentes PR4a/PR4b. Structural mirror of
 * lib/hooks/orders/use-external-income.ts (same supabase client, same
 * useQuery/useMutation shape) — create + delete shipped in PR4a; the
 * close-and-replace mutation (useCloseAndReplaceRecurringExpense, D9) is
 * PR4b, once the update dialog that drives it exists.
 */

/** Single, period-independent key. There is no date-ranged variant on
 *  purpose — rule 5: the templates query carries NO date filter, ever, so
 *  every mounted period reads the same cached list. */
export function recurringExpensesQueryKey() {
  return ["recurring-expenses"];
}

/**
 * Invalidation companion. `["orders-analytics"]` is NOT optional here:
 * creating, closing or deleting a template changes expensesTotal /
 * netRevenue / dailyData for every mounted period (design D6's single
 * allocations array runs again on refetch). `["expenses"]` is deliberately
 * NOT invalidated — a template mutation never creates or modifies an
 * `expenses` row (that only happens through "Cargar pago", PR5).
 */
export function invalidateRecurringExpenseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: recurringExpensesQueryKey() });
  queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
}

export function useRecurringExpenses() {
  const supabase = createClient();

  return useQuery({
    queryKey: recurringExpensesQueryKey(),
    queryFn: async () => {
      // No date filter, ever — see recurringExpensesQueryKey's doc comment.
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data as RecurringExpense[];
    },
  });
}

export function useCreateRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      amount: number | null; // null iff frequency !== "monthly"
      category: ExpenseCategory;
      description: string;
      frequency: RecurringExpenseFrequency;
      start_date: string;
    }) => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as RecurringExpense;
    },
    onSuccess: () => {
      invalidateRecurringExpenseQueries(queryClient);
    },
  });
}

/**
 * D4: allowed only while `template.start_date >= arTodayStr()`. Throws
 * BEFORE issuing the DELETE if that does not hold — this is the second
 * layer of defense. The primary guard is the UI: the delete button is never
 * rendered for an already-started template (recurring-expense-list.tsx),
 * never rendered-but-disabled.
 *
 * The boundary is `>=`: a template starting TODAY is still deletable. The
 * day is in progress and no closed period depends on it yet — excluding
 * today would defeat the "I mistyped it ten seconds ago" case the rule
 * exists for.
 */
/**
 * D3 of the proposal: an active template's amount is NEVER UPDATEd —
 * historical proration for periods already reported must stay exactly as it
 * was computed. Closing the row and inserting its replacement is the only
 * way to change an active template's amount.
 *
 * ORDER IS LOAD-BEARING (design D9): INSERT the replacement FIRST
 * (`start_date = effectiveFrom`, the new `amount`), and only AFTER that
 * INSERT resolves does the mutation UPDATE the old row's
 * `end_date = dayBefore(effectiveFrom)`. This is the INVERSE of jebbs' own
 * order (jebbs closes first, then inserts). No client-side transaction wraps
 * the two writes — Supabase JS has none, and this repo's standing position
 * (lib/hooks/supplies/use-order-stock-sync.ts) is to bias every unguarded
 * multi-write toward the failure mode that is visible over the one that
 * isn't, rather than fake atomicity it cannot actually provide.
 *
 * Why INSERT-then-UPDATE beats UPDATE-then-INSERT if it crashes mid-way,
 * verbatim from design.md's D9 comparison table:
 *
 * | Order | Crash between the two writes | Reported effect | Operator experience |
 * |---|---|---|---|
 * | `UPDATE` → `INSERT` | old row closed, no replacement | fixed cost **disappears** from every period after `effectiveFrom` | invisible; profit reads **optimistically high** — the exact failure mode this whole change exists to fix (*Intent*, bullet 2) |
 * | **`INSERT` → `UPDATE`** | **both rows active over the overlap** | **the template's cost is counted twice** | **visible: two rows with the same description, both badged "Activo", in the list the operator is already looking at**; profit reads conservatively low |
 *
 * A doubled rent line is wrong and obvious. A missing rent line is wrong and
 * invisible. THE VISIBLE FAILURE ALWAYS BEATS THE INVISIBLE ONE.
 *
 * `effectiveFrom` MUST be strictly after `template.start_date` — 047's
 * recurring_expenses_period_order CHECK rejects `end_date < start_date`, and
 * `effectiveFrom === start_date` computes exactly that (design D10). The
 * update dialog bounds its date picker accordingly; a same-day correction on
 * a template that has not started yet is the delete path (D4) instead.
 */
export function useCloseAndReplaceRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      template: RecurringExpense;
      amount: number;
      effectiveFrom: string;
    }) => {
      const { template, amount, effectiveFrom } = input;

      // Step 1: INSERT the replacement FIRST — see the doc comment above.
      const { data: replacement, error: insertError } = await supabase
        .from("recurring_expenses")
        .insert({
          amount,
          category: template.category,
          description: template.description,
          frequency: template.frequency,
          start_date: effectiveFrom,
          end_date: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Step 2: UPDATE the old row's end_date SECOND, only once the
      // replacement has committed.
      const { error: updateError } = await supabase
        .from("recurring_expenses")
        .update({ end_date: dayBefore(effectiveFrom) })
        .eq("id", template.id);

      if (updateError) throw updateError;

      return replacement as RecurringExpense;
    },
    onSuccess: () => {
      invalidateRecurringExpenseQueries(queryClient);
    },
  });
}

export function useDeleteRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: RecurringExpense) => {
      if (template.start_date < arTodayStr()) {
        throw new Error(
          "No se puede eliminar un gasto fijo que ya empezó. Esperá a que termine su vigencia con la fecha de fin.",
        );
      }

      const { error } = await supabase
        .from("recurring_expenses")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRecurringExpenseQueries(queryClient);
    },
  });
}
