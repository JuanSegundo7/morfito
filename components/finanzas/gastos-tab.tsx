"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Plus, TriangleAlert, X } from "lucide-react";
import { useExpenses, useDeleteExpense } from "@/lib/hooks/expenses/use-expenses";
import { ExpenseList, EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { ExpenseFormDialog } from "@/components/finanzas/expense-form-dialog";
import { formatCurrency } from "@/lib/utils/format";
import type { Expense, ExpenseCategory } from "@/lib/types";
import type { CreateExpenseResult } from "@/lib/hooks/expenses/use-expenses";

const TZ = "America/Argentina/Buenos_Aires";

// The 5 categories in a fixed, always-rendered order — mirrors
// EXPENSE_CATEGORY_LABELS' key order. Never derived from the loaded
// expenses, so a period with zero gastos in a category still shows it at
// $0 rather than omitting it (spec: expense-tracking).
const ALL_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

function toArDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Month-boundary period, same "current month, navigate with prev/next
 * chevrons" pattern /rendimiento uses for its default view (month mode) —
 * see app/(dashboard)/rendimiento/page.tsx's getPeriodLabel/navigate. Kept
 * to month granularity only here (no week/custom) since the Gastos tab has
 * no existing shared period-selector component to import from and a
 * month-only filter is the smallest surface that already satisfies the
 * spec ("filtro de período").
 */
function monthRange(date: Date): { start: string; end: string; label: string } {
  const arDate = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const year = arDate.getFullYear();
  const month = arDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = arDate.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
  return { start, end, label };
}

/**
 * finanzas-gastos-recetas PR4/PR5. Period filter + always-5 category totals
 * + expense list + create/delete. Since PR5, a "supplies"-style expense with
 * supply_id+quantity bumps stock on create and reverses it on delete (see
 * use-expenses.ts / use-expense-stock-sync.ts). `bumpFailedBanner` holds
 * the persistent partial-failure banner state: the expense saved, but the
 * bump itself failed — the toast.warning fired inside useCreateExpense is
 * the immediate signal, this banner is the one that survives after the
 * dialog closes. No retry action is ever offered for the bump step (D2:
 * a retry after a partially-applied bump can't know how far it got); the
 * only recovery path is a manual adjustment in the Insumos tab.
 */
export function GastosTab() {
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const { start, end, label } = monthRange(anchorDate);

  const { data: expenses, isLoading } = useExpenses(start, end);
  const deleteExpense = useDeleteExpense(start, end);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [bumpFailedBanner, setBumpFailedBanner] = useState<string | null>(null);

  const handleExpenseCreated = (result: CreateExpenseResult) => {
    if (result.stockBumpFailed) {
      setBumpFailedBanner(
        "El gasto se guardó, pero no se pudo actualizar el stock. Ajustalo manualmente en la pestaña Insumos.",
      );
    }
  };

  const totalsByCategory = useMemo(() => {
    const totals = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<
      ExpenseCategory,
      number
    >;
    for (const expense of expenses ?? []) {
      totals[expense.category] += Number(expense.amount);
    }
    return totals;
  }, [expenses]);

  const handlePrev = () =>
    setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const handleNext = () =>
    setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleDelete = async () => {
    if (!deletingExpense) return;
    try {
      await deleteExpense.mutateAsync(deletingExpense);
    } catch {
      /* alert already shown by the mutation's onError */
    }
    setDeleteDialogOpen(false);
    setDeletingExpense(null);
  };

  return (
    <>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev} className="bg-card h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium capitalize tabular-nums">
              {label}
            </span>
            <Button variant="outline" size="icon" onClick={handleNext} className="bg-card h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo gasto
          </Button>
        </div>

        {/* Partial-failure banner: expense saved, stock bump failed. No
            retry offered — see this component's doc comment. */}
        {bumpFailedBanner && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <p className="text-caption flex-1 text-amber-900 dark:text-amber-200">
              {bumpFailedBanner}
            </p>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-amber-700 hover:text-amber-900 shrink-0"
              onClick={() => setBumpFailedBanner(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Category totals — all 5 always shown, $0 when empty */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ALL_CATEGORIES.map((category) => (
            <Card key={category} className="bg-card">
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">
                  {EXPENSE_CATEGORY_LABELS[category]}
                </span>
                <span className="text-amount tabular-nums font-semibold">
                  {formatCurrency(totalsByCategory[category])}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Expense list */}
        <Card className="bg-card">
          <CardContent className="p-4">
            <ExpenseList
              expenses={expenses ?? []}
              isLoading={isLoading}
              isDeleting={deleteExpense.isPending}
              onDelete={(expense) => {
                setDeletingExpense(expense);
                setDeleteDialogOpen(true);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        startDate={start}
        endDate={end}
        onCreated={handleExpenseCreated}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="ios-glass rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar este gasto de{" "}
              {deletingExpense && EXPENSE_CATEGORY_LABELS[deletingExpense.category].toLowerCase()}?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
