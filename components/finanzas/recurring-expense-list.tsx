"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { arTodayStr, parseCalendarDate } from "@/lib/utils/calendar-date";
import {
  expandRecurringExpenses,
  paydayProgressFor,
  previewPaydayDates,
} from "@/lib/services/recurring-expenses";
import { useDeleteRecurringExpense } from "@/lib/hooks/expenses/use-recurring-expenses";
import { RecurringExpenseUpdateDialog } from "@/components/finanzas/recurring-expense-update-dialog";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import type { Expense, RecurringExpense, RecurringExpenseFrequency } from "@/lib/types";

/**
 * gastos-recurrentes PR4a. Canonical frequency label map — mirrors
 * expense-list.tsx's EXPENSE_CATEGORY_LABELS convention. Object key order
 * (monthly, weekly, biweekly) is reused by
 * recurring-expense-form-dialog.tsx's frequency Select, imported from here
 * rather than duplicated.
 */
export const RECURRING_FREQUENCY_LABELS: Record<RecurringExpenseFrequency, string> = {
  monthly: "Mensual",
  weekly: "Semanal",
  biweekly: "Quincenal",
};

const PAYDAY_INTERVAL_DAYS: Record<string, 7 | 15> = {
  weekly: 7,
  biweekly: 15,
};

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

interface RecurringExpenseListProps {
  templates: RecurringExpense[] | undefined;
  isLoading: boolean;
  /** The sub-tab's shared period (design D6-adjacent: the same month
   *  "Del período" already navigates), YYYY-MM-DD. Used to compute each
   *  monthly template's prorated share (expandRecurringExpenses) and each
   *  cadence template's payday preview (previewPaydayDates) for THIS
   *  period only. */
  periodStart: string;
  periodEnd: string;
  /**
   * gastos-recurrentes PR5. The SAME `useExpenses(start, end)` result the
   * "Del período" sub-tab already fetches — passed down rather than
   * re-queried here, so the payday counter never triggers a second fetch of
   * the same range. Feeds `paydayProgressFor`, which matches by
   * `recurring_expense_id` only (rule 13) — never by description or
   * category.
   */
  expenses: Expense[] | undefined;
  /**
   * gastos-recurrentes PR5. "Cargar pago" click handler for an informational
   * (weekly/biweekly) template — the parent (gastos-tab.tsx) owns the
   * prefill state and opens ExpenseFormDialog with it (design D8).
   */
  onLoadPayment: (template: RecurringExpense) => void;
}

/**
 * gastos-recurrentes PR4a/PR4b. One row per template: description, category
 * badge, frequency badge, Activo/"Cerrado el {end_date}" badge, "Desde
 * {start_date}", and either the monthly amount + this period's prorated
 * share, or the weekly/biweekly cadence preview (D1 — payday dates, not an
 * amount, since those templates carry no knowable amount).
 *
 * Delete button is rendered ONLY when `start_date >= arTodayStr()` —
 * absent, never a disabled button with a tooltip (D4, D2 of design.md: the
 * mutation itself is the second layer, this omission is the primary one).
 *
 * PR4b: "Actualizar" is rendered ONLY on `monthly` templates that are still
 * Activo (`end_date === null`) — a template's amount is never UPDATEd in
 * place (D3 of the proposal), and weekly/biweekly templates carry no amount
 * to change in the first place. Opens RecurringExpenseUpdateDialog, which
 * drives useCloseAndReplaceRecurringExpense (design D9/D10).
 *
 * PR5: informational (weekly/biweekly) rows get a "Cargar pago" button
 * (delegates to the parent's `onLoadPayment`, which opens ExpenseFormDialog
 * prefilled per design D8) and an "N de M pagos cargados" line from
 * `paydayProgressFor`, fed by the sub-tab's already-fetched
 * `useExpenses(start, end)` — no second fetch here.
 */
export function RecurringExpenseList({
  templates,
  isLoading,
  periodStart,
  periodEnd,
  expenses,
  onLoadPayment,
}: RecurringExpenseListProps) {
  const deleteTemplate = useDeleteRecurringExpense();
  const [deletingTemplate, setDeletingTemplate] = useState<RecurringExpense | null>(null);
  const [updatingTemplate, setUpdatingTemplate] = useState<RecurringExpense | null>(null);

  const periodStartCal = useMemo(() => parseCalendarDate(periodStart), [periodStart]);
  const periodEndCal = useMemo(() => parseCalendarDate(periodEnd), [periodEnd]);

  // Computed once for the whole list and looked up by templateId below —
  // same "one array, reused" spirit as design D6's hook-level allocations,
  // applied here to the per-template proration instead of the aggregate.
  const proratedByTemplateId = useMemo(() => {
    const allocations = expandRecurringExpenses(templates ?? [], periodStartCal, periodEndCal);
    return new Map(allocations.map((allocation) => [allocation.templateId, allocation.amount]));
  }, [templates, periodStartCal, periodEndCal]);

  const handleConfirmDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteTemplate.mutateAsync(deletingTemplate);
    } catch {
      /* react-query onError already surfaces the alert */
    }
    setDeletingTemplate(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <p className="text-subheadline text-muted-foreground text-center py-8">
        Sin gastos fijos configurados
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {templates.map((template) => {
          const isMonthly = template.frequency === "monthly";
          const canDelete = template.start_date >= arTodayStr();

          const secondaryLine = isMonthly
            ? `${formatCurrency(template.amount ?? 0)}/mes · ${formatCurrency(
                proratedByTemplateId.get(template.id) ?? 0,
              )} en este período`
            : (() => {
                const intervalDays = PAYDAY_INTERVAL_DAYS[template.frequency];
                const dates = previewPaydayDates(
                  template.start_date,
                  intervalDays,
                  periodStartCal,
                  periodEndCal,
                );
                return dates.length > 0
                  ? `Próximos pagos: ${dates.map(formatShortDate).join(", ")}`
                  : "Sin pagos previstos en este período";
              })();

          return (
            <div
              key={template.id}
              className="flex flex-col gap-1.5 rounded-xl bg-muted/40 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0">
                  {EXPENSE_CATEGORY_LABELS[template.category]}
                </Badge>
                <Badge variant="outline" className="shrink-0">
                  {RECURRING_FREQUENCY_LABELS[template.frequency]}
                </Badge>
                <Badge
                  variant={template.end_date ? "outline" : "secondary"}
                  className="shrink-0"
                >
                  {template.end_date ? `Cerrado el ${formatDisplayDate(template.end_date)}` : "Activo"}
                </Badge>
                <span className="flex-1 text-subheadline font-medium truncate">
                  {template.description}
                </span>
                {isMonthly && !template.end_date && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setUpdatingTemplate(template)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {!isMonthly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onLoadPayment(template)}
                  >
                    <Receipt className="mr-1.5 h-3.5 w-3.5" />
                    Cargar pago
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setDeletingTemplate(template)}
                    disabled={deleteTemplate.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span>Desde {formatDisplayDate(template.start_date)}</span>
                <span>·</span>
                <span className="tabular-nums">{secondaryLine}</span>
              </div>
              {!isMonthly &&
                (() => {
                  // Rule 13: matches expenses by recurring_expense_id ONLY
                  // (paydayProgressFor's own contract) — never by
                  // description or category, so renaming the template or a
                  // non-"salaries" category never breaks the count.
                  const progress = paydayProgressFor(
                    template,
                    expenses,
                    periodStartCal,
                    periodEndCal,
                  );
                  return (
                    <span className="text-caption text-muted-foreground tabular-nums">
                      {progress.loaded} de {progress.expected} pagos cargados
                    </span>
                  );
                })()}
            </div>
          );
        })}
      </div>

      <RecurringExpenseUpdateDialog
        open={!!updatingTemplate}
        onOpenChange={(o) => !o && setUpdatingTemplate(null)}
        template={updatingTemplate}
      />

      <AlertDialog open={!!deletingTemplate} onOpenChange={(o) => !o && setDeletingTemplate(null)}>
        <AlertDialogContent className="ios-glass rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto fijo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar {deletingTemplate?.description}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
