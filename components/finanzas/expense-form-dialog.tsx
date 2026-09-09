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
import { useCreateExpense } from "@/lib/hooks/expenses/use-expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import type { ExpenseCategory } from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

function todayArStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = (
  Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]
).map(([value, label]) => ({ value, label }));

const NO_SUPPLY = "__none__";

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Gastos tab's current period — new expenses invalidate this range
   * via useCreateExpense, same as ExternalIncomePanel's pattern. */
  startDate: string;
  endDate: string;
}

/**
 * finanzas-gastos-recetas PR4. Create-only (no edit — D6). Date/amount/
 * category are always required; supply_id/quantity are optional but must
 * be filled together, mirroring scripts/045-expenses.sql's
 * expenses_supply_bump_pairing CHECK client-side so an invalid combination
 * never reaches the INSERT.
 *
 * NOTE: in THIS PR, choosing a supply + quantity captures and persists the
 * pairing but has NO stock effect — the bump is wired up in PR5
 * (lib/hooks/supplies/use-expense-stock-sync.ts). The note below is the
 * user-facing signal for that gap.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
}: ExpenseFormDialogProps) {
  const { data: supplies } = useSupplies();
  const createExpense = useCreateExpense(startDate, endDate);

  const [date, setDate] = useState(todayArStr());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [description, setDescription] = useState("");
  const [supplyId, setSupplyId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(todayArStr());
    setAmount("");
    setCategory("supplies");
    setDescription("");
    setSupplyId(null);
    setQuantity("");
  }, [open]);

  function formatDisplayDate(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const parsedAmount = parseFloat(amount.replace(",", "."));
  const parsedQuantity = parseFloat(quantity.replace(",", "."));

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
      await createExpense.mutateAsync({
        date,
        amount: parsedAmount,
        category,
        description: description.trim() || null,
        supply_id: supplyId,
        quantity: supplyId ? parsedQuantity : null,
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

          {supplyId && (
            <p className="text-caption text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              El stock todavía no se actualiza automáticamente con este gasto — vas a tener que
              ajustarlo manualmente en la pestaña Insumos.
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
