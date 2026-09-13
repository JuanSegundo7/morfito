"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useOrdersAnalytics } from "@/lib/hooks/orders/use-orders-history";
import { useRecurringExpenses } from "@/lib/hooks/expenses/use-recurring-expenses";
import { ExpenseList, EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { ExpenseFormDialog, type ExpenseFormPrefill } from "@/components/finanzas/expense-form-dialog";
import { RecurringExpenseList } from "@/components/finanzas/recurring-expense-list";
import { RecurringExpenseFormDialog } from "@/components/finanzas/recurring-expense-form-dialog";
import { formatCurrency } from "@/lib/utils/format";
import type { Expense, ExpenseCategory, RecurringExpense } from "@/lib/types";
import type { CreateExpenseResult } from "@/lib/hooks/expenses/use-expenses";

const GASTOS_SUB_TABS = ["periodo", "fijos"] as const;
type GastosSubTab = (typeof GASTOS_SUB_TABS)[number];

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
 *
 * gastos-recurrentes PR4a: nests a "Del período" / "Fijos mensuales"
 * sub-Tabs inside this component. `anchorDate`/`start`/`end` are lifted
 * above the sub-tabs (they already lived at this level) so both share
 * exactly one period — "Fijos mensuales" prorates and previews cadences
 * for the same month "Del período" is showing. This is an internal
 * useState, NOT synced to finanzas-tabs.tsx's `?tab=` — the top-level tab
 * union stays a 4-value union, this is not a 5th top-level tab.
 *
 * gastos-recurrentes PR5: `prefill` (design D8) lives in `useState` here —
 * NEVER built as an inline object literal at ExpenseFormDialog's call site
 * below, because that prop sits in the dialog's reset-on-open effect deps
 * and an inline literal would re-run that reset (wiping a typed amount) on
 * every render of THIS component. The "Cargar pago" handler sets it and
 * opens the dialog; a successful save switches back to "Del período" so the
 * new payment is visible where it landed; closing the dialog clears it.
 */
export function GastosTab() {
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const { start, end, label } = monthRange(anchorDate);
  const [subTab, setSubTab] = useState<GastosSubTab>("periodo");

  const { data: expenses, isLoading } = useExpenses(start, end);
  const deleteExpense = useDeleteExpense(start, end);
  // gastos-recurrentes PR3 — same period the "Del período" list above already
  // uses (anchorDate, month mode, matching monthRange's own boundaries).
  // Reads expensesByCategory instead of running a local reduce, so this
  // tab's category totals can never drift from Resumen's (design D7).
  const { data: analytics } = useOrdersAnalytics(anchorDate);
  // gastos-recurrentes PR4a — unfiltered, per rule 5 (recurringExpensesQueryKey
  // carries no date-range variant); the period is applied client-side by
  // RecurringExpenseList when it prorates/previews for `start`/`end`.
  const { data: recurringExpenses, isLoading: isRecurringLoading } = useRecurringExpenses();

  const [formOpen, setFormOpen] = useState(false);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [bumpFailedBanner, setBumpFailedBanner] = useState<string | null>(null);
  // gastos-recurrentes PR5 (design D8) — see this component's doc comment
  // above for why this MUST be state, never an inline literal at the
  // ExpenseFormDialog call site below.
  const [prefill, setPrefill] = useState<ExpenseFormPrefill | null>(null);

  const handleExpenseCreated = (result: CreateExpenseResult) => {
    if (result.stockBumpFailed) {
      setBumpFailedBanner(
        "El gasto se guardó, pero no se pudo actualizar el stock. Ajustalo manualmente en la pestaña Insumos.",
      );
    }
    // The payment just saved is only visible in "Del período" — switch there
    // so it lands where the operator can see it, regardless of which
    // sub-tab "Cargar pago" was opened from.
    setSubTab("periodo");
  };

  const handleLoadPayment = (template: RecurringExpense) => {
    setPrefill({
      category: template.category,
      description: template.description,
      recurringExpenseId: template.id,
    });
    setFormOpen(true);
  };

  const handleFormOpenChange = (nextOpen: boolean) => {
    setFormOpen(nextOpen);
    if (!nextOpen) setPrefill(null);
  };

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
      <div className="flex-1 overflow-auto p-6 md:px-0 space-y-4">
        {/* Period selector — shared by both sub-tabs (anchorDate lifted
            above the Tabs below). */}
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

          {subTab === "periodo" ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo gasto
            </Button>
          ) : (
            <Button onClick={() => setRecurringFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo gasto fijo
            </Button>
          )}
        </div>

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as GastosSubTab)}>
          <TabsList>
            <TabsTrigger value="periodo">Del período</TabsTrigger>
            <TabsTrigger value="fijos">Fijos mensuales</TabsTrigger>
          </TabsList>

          <TabsContent value="periodo" className="space-y-4 pt-4">
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
                      {formatCurrency(analytics?.expensesByCategory?.[category] ?? 0)}
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
          </TabsContent>

          <TabsContent value="fijos" className="pt-4">
            <Card className="bg-card">
              <CardContent className="p-4">
                <RecurringExpenseList
                  templates={recurringExpenses}
                  isLoading={isRecurringLoading}
                  periodStart={start}
                  periodEnd={end}
                  expenses={expenses}
                  onLoadPayment={handleLoadPayment}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        startDate={start}
        endDate={end}
        onCreated={handleExpenseCreated}
        prefill={prefill}
      />

      <RecurringExpenseFormDialog open={recurringFormOpen} onOpenChange={setRecurringFormOpen} />

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
