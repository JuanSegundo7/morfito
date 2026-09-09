"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { useCreateRecurringExpense } from "@/lib/hooks/expenses/use-recurring-expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { RECURRING_FREQUENCY_LABELS } from "@/components/finanzas/recurring-expense-list";
import { arTodayStr } from "@/lib/utils/calendar-date";
import type { ExpenseCategory, RecurringExpenseFrequency } from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = (
  Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]
).map(([value, label]) => ({ value, label }));

/**
 * gastos-recurrentes PR4a, design D6. Generic across ALL categories — a
 * weekly cleaning service is frequency="weekly", category="services". No
 * gate restricts weekly/biweekly to "salaries", and changing category never
 * resets frequency back to "monthly". Labels imported from
 * recurring-expense-list.tsx (RECURRING_FREQUENCY_LABELS) so the Select and
 * the list's frequency badge can never drift.
 */
const FREQUENCY_OPTIONS: { value: RecurringExpenseFrequency; label: string }[] = (
  Object.entries(RECURRING_FREQUENCY_LABELS) as [RecurringExpenseFrequency, string][]
).map(([value, label]) => ({ value, label }));

interface RecurringExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * gastos-recurrentes PR4a. Create-only for now — closing/replacing an
 * active template's amount (D9) is a separate dialog
 * (recurring-expense-update-dialog.tsx, PR4b).
 *
 * Frequency Select is ALWAYS visible and never coupled to category (D6):
 * no "solo para sueldos" gate, no forced reset to "monthly" on category
 * change. The amount field is rendered ONLY when frequency === "monthly",
 * and required in that case — this mirrors 047's
 * recurring_expenses_monthly_amount CHECK client-side (rule 11):
 * weekly/biweekly templates are informational only, their real payment is a
 * one-off expense logged later via "Cargar pago" (PR5).
 */
export function RecurringExpenseFormDialog({
  open,
  onOpenChange,
}: RecurringExpenseFormDialogProps) {
  const createRecurringExpense = useCreateRecurringExpense();

  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<RecurringExpenseFrequency>("monthly");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(arTodayStr());
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("supplies");
    setDescription("");
    setFrequency("monthly");
    setAmount("");
    setStartDate(arTodayStr());
  }, [open]);

  function formatDisplayDate(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const parsedAmount = parseFloat(amount.replace(",", "."));
  const isMonthly = frequency === "monthly";
  const amountValid = !isMonthly || (!isNaN(parsedAmount) && parsedAmount > 0);

  const canSave =
    !!description.trim() &&
    !!startDate &&
    amountValid &&
    !createRecurringExpense.isPending;

  const handleClose = () => onOpenChange(false);

  const handleSave = async () => {
    if (!canSave) return;

    try {
      await createRecurringExpense.mutateAsync({
        amount: isMonthly ? parsedAmount : null,
        category,
        description: description.trim(),
        frequency,
        start_date: startDate,
      });
      handleClose();
    } catch {
      /* react-query onError already surfaces the alert */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo gasto fijo</DialogTitle>
          <DialogDescription>
            Registrá un costo recurrente — se prorratea automáticamente en cada período.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Categoría *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Descripción *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Alquiler del local"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frecuencia *</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurringExpenseFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isMonthly && (
              <div className="space-y-2">
                <Label>Monto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          {!isMonthly && (
            <p className="text-caption text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              Este gasto es informativo: no suma monto al período. Cada pago real se carga
              después con &quot;Cargar pago&quot;.
            </p>
          )}

          <div className="space-y-2">
            <Label>Fecha de inicio *</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {formatDisplayDate(startDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(startDate + "T12:00:00")}
                  onSelect={(d) => {
                    if (d) setStartDate(d.toLocaleDateString("en-CA", { timeZone: TZ }));
                    setCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button disabled={!canSave} onClick={handleSave}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
