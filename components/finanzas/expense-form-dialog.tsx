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
import { useSupplies } from "@/lib/hooks/supplies/use-supplies";
import { useCreateExpense, type CreateExpenseResult } from "@/lib/hooks/expenses/use-expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { arTodayStr } from "@/lib/utils/calendar-date";
import type { ExpenseCategory } from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = (
  Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]
).map(([value, label]) => ({ value, label }));

const NO_SUPPLY = "__none__";

/**
 * gastos-recurrentes PR5. What "Cargar pago" hands to the dialog when it
 * opens it from an informational (weekly/biweekly) template: the template's
 * own category/description, and the FK the resulting expense row must carry
 * so the "N de M pagos cargados" counter can find it (rule 13 — FK match
 * only, never text). Deliberately has no `amount` field — rule 1: the real
 * payment amount is never knowable in advance, so it is never prefilled.
 */
export interface ExpenseFormPrefill {
  category: ExpenseCategory;
  description: string;
  recurringExpenseId: string;
}

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Gastos tab's current period — new expenses invalidate this range
   * via useCreateExpense, same as ExternalIncomePanel's pattern. */
  startDate: string;
  endDate: string;
  /** Called after a successful save (bump-failed or not) so the Gastos tab
   * can show its own partial-failure banner — the toast.warning fired
   * inside useCreateExpense is immediate feedback, this is the persistent
   * one. */
  onCreated?: (result: CreateExpenseResult) => void;
  /**
   * gastos-recurrentes PR5 (design D8). Seeds category/description/FK when
   * "Cargar pago" opens this dialog from an informational template; `null`/
   * `undefined` for a plain "Nuevo gasto" open.
   *
   * MUST be referentially stable across renders of the caller. It sits in
   * this component's reset-on-open effect's dependency array (below), so an
   * inline object literal at the call site (`prefill={{ category, ... }}`)
   * gets a new reference on every render of the PARENT and re-runs the reset
   * while the operator is mid-keystroke on the amount field — silently
   * wiping what they just typed. The caller must hold this in `useState`,
   * never construct it inline in JSX.
   */
  prefill?: ExpenseFormPrefill | null;
}

/**
 * finanzas-gastos-recetas PR4/PR5. Create-only (no edit — D6). Date/amount/
 * category are always required; supply_id/quantity are optional but must
 * be filled together, mirroring scripts/045-expenses.sql's
 * expenses_supply_bump_pairing CHECK client-side so an invalid combination
 * never reaches the INSERT.
 *
 * Since PR5, choosing a supply + quantity actually bumps
 * `supplies.stock_quantity` on save (lib/hooks/supplies/
 * use-expense-stock-sync.ts) — the preview line below tells the operator
 * what will happen before they confirm. If the bump itself fails, the
 * expense is still saved; useCreateExpense surfaces a toast.warning and the
 * Gastos tab shows a manual-adjust banner (never a retry for that step).
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
  onCreated,
  prefill,
}: ExpenseFormDialogProps) {
  const { data: supplies } = useSupplies();
  const createExpense = useCreateExpense(startDate, endDate);

  const [date, setDate] = useState(arTodayStr());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [description, setDescription] = useState("");
  const [supplyId, setSupplyId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [recurringExpenseId, setRecurringExpenseId] = useState<string | null>(null);

  // gastos-recurrentes PR5 (design D8): extends this SAME reset-on-open
  // effect instead of a second, competing one — a second effect racing this
  // one on overlapping deps is exactly the "silently wiped" failure the
  // design flags. `amount` is NEVER seeded from `prefill` (rule 1 — a
  // weekly/biweekly template's real payment amount isn't knowable in
  // advance, that's the whole reason the template is informational-only).
  // `prefill` is in the dep array on purpose; see the prop's JSDoc above for
  // why the caller MUST keep it referentially stable.
  useEffect(() => {
    if (!open) return;
    setDate(arTodayStr());
    setAmount("");
    setCategory(prefill?.category ?? "supplies");
    setDescription(prefill?.description ?? "");
    setSupplyId(null);
    setQuantity("");
    setRecurringExpenseId(prefill?.recurringExpenseId ?? null);
  }, [open, prefill]);

  function formatDisplayDate(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const parsedAmount = parseFloat(amount.replace(",", "."));
  const parsedQuantity = parseFloat(quantity.replace(",", "."));
  const selectedSupply = supplies?.find((s) => s.id === supplyId) ?? null;

  // Mirrors the DB's expenses_supply_bump_pairing CHECK: both present or
  // neither. A supply chosen without a quantity (or vice versa) blocks save
  // instead of silently dropping one side.
  const pairingValid = supplyId
    ? quantity.trim() !== "" && !isNaN(parsedQuantity) && parsedQuantity > 0
    : quantity.trim() === "";

  const canSave =
    !!date && !isNaN(parsedAmount) && parsedAmount !== 0 && pairingValid && !createExpense.isPending;

  const handleClose = () => onOpenChange(false);

  const handleSave = async () => {
    if (!canSave) return;

    try {
      const result = await createExpense.mutateAsync({
        date,
        amount: parsedAmount,
        category,
        description: description.trim() || null,
        supply_id: supplyId,
        quantity: supplyId ? parsedQuantity : null,
        recurring_expense_id: recurringExpenseId,
      });
      onCreated?.(result);
      handleClose();
    } catch {
      /* react-query onError already surfaces the alert */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
          <DialogDescription>Registrá un gasto operativo del período.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {formatDisplayDate(date)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(date + "T12:00:00")}
                    onSelect={(d) => {
                      if (d) setDate(d.toLocaleDateString("en-CA", { timeZone: TZ }));
                      setCalendarOpen(false);
                    }}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>

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
          </div>

          <div className="space-y-2">
            <Label>Categoría *</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ExpenseCategory)}
            >
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
            <Label>
              Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Compra de harina al por mayor"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Insumo <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Select
                value={supplyId ?? NO_SUPPLY}
                onValueChange={(v) => {
                  setSupplyId(v === NO_SUPPLY ? null : v);
                  if (v === NO_SUPPLY) setQuantity("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin insumo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLY}>Sin insumo</SelectItem>
                  {supplies?.map((supply) => (
                    <SelectItem key={supply.id} value={supply.id}>
                      {supply.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Cantidad{" "}
                {supplyId && <span className="text-muted-foreground font-normal">*</span>}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                disabled={!supplyId}
              />
            </div>
          </div>

          {selectedSupply && pairingValid && (
            <p className="text-caption text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              Esto va a sumar {parsedQuantity} {selectedSupply.unit} al stock de{" "}
              {selectedSupply.name}.
            </p>
          )}
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
