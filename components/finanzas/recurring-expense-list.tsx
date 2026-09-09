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
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { arTodayStr, parseCalendarDate } from "@/lib/utils/calendar-date";
import { expandRecurringExpenses, previewPaydayDates } from "@/lib/services/recurring-expenses";
import { useDeleteRecurringExpense } from "@/lib/hooks/expenses/use-recurring-expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import type { RecurringExpense, RecurringExpenseFrequency } from "@/lib/types";

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
}

/**
 * gastos-recurrentes PR4a. One row per template: description, category
 * badge, frequency badge, Activo/"Cerrado el {end_date}" badge, "Desde
 * {start_date}", and either the monthly amount + this period's prorated
 * share, or the weekly/biweekly cadence preview (D1 — payday dates, not an
 * amount, since those templates carry no knowable amount).
 *
 * Delete button is rendered ONLY when `start_date >= arTodayStr()` —
 * absent, never a disabled button with a tooltip (D4, D2 of design.md: the
 * mutation itself is the second layer, this omission is the primary one).
 */
export function RecurringExpenseList({
  templates,
  isLoading,
  periodStart,
  periodEnd,
}: RecurringExpenseListProps) {
  const deleteTemplate = useDeleteRecurringExpense();
  const [deletingTemplate, setDeletingTemplate] = useState<RecurringExpense | null>(null);

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
            </div>
          );
        })}
      </div>

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
