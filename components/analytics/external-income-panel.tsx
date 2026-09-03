"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, CalendarIcon, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useExternalIncome,
  useCreateExternalIncome,
  useDeleteExternalIncome,
} from "@/lib/hooks/orders/use-external-income";
import { formatCurrency } from "@/lib/utils/format";
// Cost/stock/finance porting, PR3: reuse the SAME operator-configured
// source list the order wizard already uses (summary-step.tsx) — do not
// invent a separate source list for manual income entries.
import { getOrderSources, type OrderSourceConfig } from "@/lib/utils/commission";

const TZ = "America/Argentina/Buenos_Aires";

function todayArStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

interface ExternalIncomePanelProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export function ExternalIncomePanel({ startDate, endDate }: ExternalIncomePanelProps) {
  const { data: incomes, isLoading } = useExternalIncome(startDate, endDate);
  const createIncome = useCreateExternalIncome(startDate, endDate);
  const deleteIncome = useDeleteExternalIncome(startDate, endDate);

  const PAGE_SIZE = 5;
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [startDate, endDate]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayArStr());
  // Cost/stock/finance porting, PR3: manual-entry source tagging — same
  // "read once on mount, no live subscription" approach summary-step.tsx
  // already uses for this same localStorage-backed config.
  const [source, setSource] = useState<string | null>(null);
  const [orderSources, setOrderSources] = useState<OrderSourceConfig[]>([]);
  useEffect(() => {
    setOrderSources(getOrderSources());
  }, []);

  const totalExternal = incomes?.reduce((acc, e) => acc + Number(e.amount), 0) ?? 0;
  const totalPages = Math.ceil((incomes?.length ?? 0) / PAGE_SIZE);
  const paginated = incomes?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  function resetForm() {
    setAmount("");
    setDescription("");
    setSelectedDate(todayArStr());
    setSource(null);
  }

  async function handleSave() {
    const parsed = parseFloat(amount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    await createIncome.mutateAsync({
      date: selectedDate,
      amount: parsed,
      description: description.trim() || null,
      source,
    });

    setDialogOpen(false);
    resetForm();
  }

  function formatDisplayDate(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <>
      <Card className="ios-glass bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              Ingresos manuales
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-caption dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !incomes || incomes.length === 0 ? (
            <p className="text-subheadline text-muted-foreground text-center py-4">
              Sin ingresos manuales en este período
            </p>
          ) : (
            <div className="space-y-2">
              {paginated.map((income) => (
                <div
                  key={income.id}
                  className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-2.5"
                >
                  <span className="text-caption text-muted-foreground w-20 shrink-0">
                    {formatDisplayDate(income.date)}
                  </span>
                  <span className="flex-1 text-subheadline text-muted-foreground truncate">
                    {income.description ?? "—"}
                  </span>
                  <span className="text-subheadline font-semibold tabular-nums">
                    {formatCurrency(income.amount)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteIncome.mutate(income.id)}
                    disabled={deleteIncome.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1 px-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-caption text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {totalExternal > 0 && (
                <div className="flex items-center justify-between border-t pt-2 px-1">
                  <span className="text-caption text-muted-foreground">Total período</span>
                  <span className="text-subheadline font-bold tabular-nums">
                    {formatCurrency(totalExternal)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar ingreso manual</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date picker */}
            <div className="space-y-1.5">
              <label className="text-subheadline font-medium">Fecha</label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {selectedDate
                      ? formatDisplayDate(selectedDate)
                      : "Elegir fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate + "T12:00:00") : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date.toLocaleDateString("en-CA", { timeZone: TZ }));
                      }
                      setCalendarOpen(false);
                    }}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-subheadline font-medium">Monto</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {/* Cost/stock/finance porting, PR3: source (sales channel) tag —
                reuses the same operator-configured getOrderSources() list
                the order wizard's summary-step.tsx uses, only rendered
                when there's actually config to pick from (same
                hasSourceOptions gate summary-step.tsx uses). */}
            {orderSources.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Canal{" "}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <Select
                  value={source ?? "__none__"}
                  onValueChange={(v) => setSource(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin canal</SelectItem>
                    {orderSources.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-subheadline font-medium">
                Descripción{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input
                placeholder="ej: PedidosYa, Rappi..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm(); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!amount || parseFloat(amount) <= 0 || createIncome.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
