"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { Expense, ExpenseCategory } from "@/lib/types";

/**
 * finanzas-gastos-recetas PR4. Category label map — kept local to this file
 * (not a shared style module like lib/utils/order-status-style.ts) since
 * only two components (this one and expense-form-dialog.tsx) need it and a
 * plain Record is enough; extract if a third consumer shows up.
 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  supplies: "Insumos",
  services: "Servicios",
  salaries: "Sueldos",
  rent: "Alquiler",
  other: "Otros",
};

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ExpenseListProps {
  expenses: Expense[];
  isLoading: boolean;
  onDelete: (expense: Expense) => void;
  isDeleting: boolean;
}

/**
 * List of expenses: category badge + amount + date + description + delete.
 * No edit action — this repo's expenses are create+delete only (D6).
 */
export function ExpenseList({ expenses, isLoading, onDelete, isDeleting }: ExpenseListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <p className="text-subheadline text-muted-foreground text-center py-8">
        Sin gastos en este período
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-2.5"
        >
          <Badge variant="secondary" className="shrink-0">
            {EXPENSE_CATEGORY_LABELS[expense.category]}
          </Badge>
          <span className="text-caption text-muted-foreground w-20 shrink-0">
            {formatDisplayDate(expense.date)}
          </span>
          <span className="flex-1 text-subheadline text-muted-foreground truncate">
            {expense.description ?? "—"}
          </span>
          <span className="text-subheadline font-semibold tabular-nums">
            {formatCurrency(expense.amount)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onDelete(expense)}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
