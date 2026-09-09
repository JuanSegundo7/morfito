"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory } from "@/lib/types";
import {
  applyExpenseStockBump,
  invalidateExpenseStockQueries,
  reverseExpenseStockBump,
} from "@/lib/hooks/supplies/use-expense-stock-sync";

/**
 * finanzas-gastos-recetas PR4/PR5. Structural mirror of
 * lib/hooks/orders/use-external-income.ts (same supabase client, same
 * useQuery/useMutation shape, same create+delete-only surface — no update
 * hook, per D6: morfito's own external_income precedent, not jebbs). See
 * design.md D6 for why this repo's own external_income is the model.
 *
 * PR5 wires the stock bump: see useCreateExpense/useDeleteExpense below and
 * lib/hooks/supplies/use-expense-stock-sync.ts's header for the write-
 * ordering rationale.
 */

/**
 * `useCreateExpense`'s resolved value. `stockBumpFailed` is true only when
 * the expense INSERT committed but the follow-up stock bump threw — the
 * expense is never rolled back for a bump failure (see design.md D2's
 * "Failure UX": no client-side transaction spans the two writes), so callers
 * use this flag to surface a "saved, but adjust stock manually" banner
 * instead of treating the whole mutation as failed.
 */
export type CreateExpenseResult = Expense & { stockBumpFailed: boolean };

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
 * doesn't pointlessly refetch the whole supplies list. Since PR5, it is
 * `Boolean(supply_id && quantity)` — the INTENT to bump stock, regardless of
 * whether the bump itself succeeded (a failed bump still touched nothing,
 * but re-fetching supplies is harmless and keeps this call site simple).
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
    }): Promise<CreateExpenseResult> => {
      const { data, error } = await supabase
        .from("expenses")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      const expense = data as Expense;

      // Past this point the expense EXISTS no matter what follows — see
      // design.md's "Data Flow — expense create with stock bump" diagram.
      // No rollback on a bump failure below: the thing the user asked for
      // (save the expense) already succeeded.
      if (!expense.supply_id || !expense.quantity) {
        return { ...expense, stockBumpFailed: false };
      }

      try {
        await applyExpenseStockBump(
          supabase,
          expense.id,
          expense.supply_id,
          expense.quantity,
        );
        return { ...expense, stockBumpFailed: false };
      } catch {
        // toast.warning, not toast.error (house rule in
        // app/(dashboard)/layout.tsx): lo pedido SI paso (el gasto se
        // guardo); solo fallo un efecto secundario. Nunca se ofrece un
        // retry para este paso puntual — un reintento sobre un bump
        // parcialmente aplicado no tiene forma de saber cuanto llego a
        // aplicarse (ver use-expense-stock-sync.ts).
        const { data: supply } = await supabase
          .from("supplies")
          .select("name")
          .eq("id", expense.supply_id)
          .maybeSingle();
        toast.warning(
          `El gasto se guardó, pero no se pudo actualizar el stock de ${
            supply?.name ?? "el insumo"
          }. Ajustalo manualmente en la pestaña Insumos.`,
        );
        return { ...expense, stockBumpFailed: true };
      }
    },
    onSuccess: (result) => {
      const touchedStock = Boolean(result.supply_id && result.quantity);
      invalidateExpenseQueries(queryClient, { touchedStock });
      if (touchedStock) invalidateExpenseStockQueries(queryClient, result.id);
    },
  });
}

export function useDeleteExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expense: Pick<Expense, "id" | "supply_id" | "quantity">) => {
      const touchedStock = Boolean(expense.supply_id && expense.quantity);

      // D2's 3-step delete ordering (full rationale in
      // use-expense-stock-sync.ts's header): reverse the stock movement
      // FIRST, then delete the expenses row LAST. expense_stock_movements'
      // expense_id is ON DELETE CASCADE — deleting `expenses` first would
      // let the cascade silently erase the ledger row before the stock was
      // ever decremented back.
      if (touchedStock) {
        await reverseExpenseStockBump(supabase, expense.id);
      }

      const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
      if (error) throw error;

      return { id: expense.id, touchedStock };
    },
    onSuccess: ({ id, touchedStock }) => {
      invalidateExpenseQueries(queryClient, { touchedStock });
      if (touchedStock) invalidateExpenseStockQueries(queryClient, id);
    },
  });
}
