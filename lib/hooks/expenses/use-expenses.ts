"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory } from "@/lib/types";

/**
 * finanzas-gastos-recetas PR4. Structural mirror of
 * lib/hooks/orders/use-external-income.ts (same supabase client, same
 * useQuery/useMutation shape, same create+delete-only surface — no update
 * hook, per D6: morfito's own external_income precedent, not jebbs). See
 * design.md D6 for why this repo's own external_income is the model.
 */

export function expensesQueryKey(startDate: string, endDate: string) {
  return ["expenses", startDate, endDate];
}

/**
 * Invalidation companion, mirroring use-supplies-crud.ts's
 * invalidateSupplyQueries and use-order-stock-sync.ts's
 * invalidateOrderStockQueries.
 *
 * DELIBERATE DIFFERENCE FROM use-external-income.ts's queryKey-only
 * invalidation: an expense written from the Gastos tab (whose period filter
 * is its own state) also changes the Resumen tab's expensesTotal/netRevenue
 * for a DIFFERENT range. Invalidating the ["expenses"] PREFIX catches every
 * mounted range. The narrower external-income behaviour is a latent
 * staleness bug we are not reproducing here; fixing external-income itself
 * is out of scope.
 *
 * `touchedStock` gates the supplies invalidations so a rent/salaries expense
 * doesn't pointlessly refetch the whole supplies list. In THIS PR every
 * mutation call site always passes `touchedStock: false` — the stock bump
 * doesn't exist until PR5's use-expense-stock-sync.ts.
 *
 * ["revenue-by-source"] is deliberately NOT invalidated — expenses carry no
 * `source` and contribute nothing to that aggregation.
 */
export function invalidateExpenseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  { touchedStock }: { touchedStock: boolean },
) {
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });

  if (touchedStock) {
    queryClient.invalidateQueries({ queryKey: ["supplies"] });
    queryClient.invalidateQueries({ queryKey: ["all-supplies"] });
    queryClient.invalidateQueries({ queryKey: ["expense-stock-movements"] });
  }
}

export function useExpenses(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: expensesQueryKey(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
  });
}

export function useCreateExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      date: string;
      amount: number;
      category: ExpenseCategory;
      description: string | null;
      supply_id: string | null;
      quantity: number | null;
    }) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as Expense;
    },
    onSuccess: () => {
      // Always false in this PR — the bump lands in PR5. See this file's
      // invalidateExpenseQueries doc comment.
      invalidateExpenseQueries(queryClient, { touchedStock: false });
    },
  });
}

export function useDeleteExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateExpenseQueries(queryClient, { touchedStock: false });
    },
  });
}
