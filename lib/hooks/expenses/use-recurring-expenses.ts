"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { arTodayStr } from "@/lib/utils/calendar-date";
import type { ExpenseCategory, RecurringExpense, RecurringExpenseFrequency } from "@/lib/types";

/**
 * gastos-recurrentes PR4a. Structural mirror of
 * lib/hooks/orders/use-external-income.ts (same supabase client, same
 * useQuery/useMutation shape) — create + delete only here; the
 * close-and-replace mutation (useCloseAndReplaceRecurringExpense, D9) ships
 * in PR4b, once the update dialog that drives it exists.
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
