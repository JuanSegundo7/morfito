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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { useCloseAndReplaceRecurringExpense } from "@/lib/hooks/expenses/use-recurring-expenses";
import { addDays, formatCalendarDate, parseCalendarDate } from "@/lib/utils/calendar-date";
import type { RecurringExpense } from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface RecurringExpenseUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringExpense | null;
}

/**
 * gastos-recurrentes PR4b. Close-and-replace UI for an active `monthly`
 * template's amount (D3 of the proposal: the amount is never UPDATEd
 * in place — this dialog only collects the two inputs
 * `useCloseAndReplaceRecurringExpense` needs; the INSERT-then-UPDATE write
 * order itself lives entirely in the hook, per design D9).
 *
 * The date picker is bounded to STRICTLY AFTER `template.start_date` — never
 * `>=`, never equal (design D10). 047's `recurring_expenses_period_order`
 * CHECK rejects `end_date < start_date`; picking `effectiveFrom ===
 * start_date` would ask the hook to compute
 * `end_date = dayBefore(effectiveFrom) = start_date - 1 day`, which that
 * CHECK rejects. Rather than surface a Supabase error, the picker simply
 * cannot select that day (or any day before it) — the earliest selectable
 * day is `start_date + 1`.
 *
 * A same-day correction on a template that has not started yet is NOT this
 * dialog's job: it is the delete path (D4 permits deleting exactly while
 * `start_date >= today`), because nothing has been reported yet and there is
 * no history close-and-replace needs to preserve. The copy below says this
 * explicitly instead of leaving the disabled date unexplained.
 */
export function RecurringExpenseUpdateDialog({
  open,
  onOpenChange,
  template,
}: RecurringExpenseUpdateDialogProps) {
  const closeAndReplace = useCloseAndReplaceRecurringExpense();

  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Earliest day the picker allows: start_date + 1 (design D10 — strictly
  // after, never >=). Recomputed only when the template changes, not on
  // every render.
  const earliestSelectable = template
    ? formatCalendarDate(addDays(parseCalendarDate(template.start_date), 1))
    : null;

  useEffect(() => {
    if (!open || !template) return;
    setAmount(template.amount != null ? String(template.amount) : "");
    setEffectiveFrom(earliestSelectable ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template]);

  const parsedAmount = parseFloat(amount.replace(",", "."));
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const dateValid =
    !!effectiveFrom && !!template && effectiveFrom > template.start_date;

  const canSave = amountValid && dateValid && !closeAndReplace.isPending;

  const handleClose = () => onOpenChange(false);

  const handleSave = async () => {
    if (!canSave || !template) return;

    try {
      await closeAndReplace.mutateAsync({
        template,
        amount: parsedAmount,
        effectiveFrom,
      });
      handleClose();
    } catch {
      /* react-query onError already surfaces the alert */
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>Actualizar {template.description}</DialogTitle>
          <DialogDescription>
            El monto anterior queda registrado tal cual estaba — este gasto fijo se cierra y se
            reemplaza por uno nuevo a partir de la fecha elegida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nuevo monto *</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Efectivo desde *</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {effectiveFrom ? formatDisplayDate(effectiveFrom) : "Elegí una fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={effectiveFrom ? new Date(effectiveFrom + "T12:00:00") : undefined}
                  disabled={{ before: new Date(`${earliestSelectable}T12:00:00`) }}
                  onSelect={(d) => {
                    if (d) setEffectiveFrom(d.toLocaleDateString("en-CA", { timeZone: TZ }));
                    setCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <p className="text-caption text-muted-foreground">
              Para cambiar un gasto fijo que todavía no empezó, eliminalo y creálo de nuevo.
            </p>
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
