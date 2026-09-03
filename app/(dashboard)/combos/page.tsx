"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Layers, Loader2 } from "lucide-react";
import {
  useAllCombos,
  useCreateCombo,
  useDeleteCombo,
  useCreateComboWithSlots,
  useUpdateComboWithSlots,
} from "@/lib/hooks/use-combos";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Combo } from "@/lib/types/combo-types";
import { useVertical } from "@/components/providers/vertical-provider";

/* -------------------------------------------------- */

const EMPTY_FORM = {
  name: "",
  price: "",
  is_available: true,

  burgers_qty: 0,
  burgers_default_meat_quantity: 2,

  include_drink: false,
  drink_qty: 1,

  include_side: false,
  side_qty: 1,

  include_fries: true,
};

export default function CombosPage() {
  const vertical = useVertical();
  const { data: combos, isLoading, isError } = useAllCombos();
  const createCombo = useCreateCombo();
  const updateComboWithSlots = useUpdateComboWithSlots();
  const deleteCombo = useDeleteCombo();
  const createComboWithSlots = useCreateComboWithSlots();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [deleting, setDeleting] = useState<Combo | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);

  /* ---------- HELPERS ---------- */

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleting(null);
  };

  /* ---------- OPENERS ---------- */

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (combo: Combo) => {
    const c = combo as import("@/lib/types/combo-types").ComboWithSlots;
    const burgerSlot = c.slots?.find((s) => s.slot_type === "burger");
    const drinkSlot = c.slots?.find((s) => s.slot_type === "drink");
    const sideSlot = c.slots?.find(
      (s) => s.slot_type === "side" || s.slot_type === "nuggets",
    );

    setEditing(combo);
    setForm({
      name: combo.name,
      price: combo.price.toString(),
      is_available: combo.is_available,
      burgers_qty: burgerSlot?.quantity ?? 0,
      burgers_default_meat_quantity: burgerSlot?.default_meat_quantity ?? 2,
      include_drink: !!drinkSlot,
      drink_qty: drinkSlot?.quantity ?? 1,
      include_side: !!sideSlot,
      side_qty: sideSlot?.quantity ?? 1,
      include_fries: !burgerSlot?.rules?.no_fries,
    });
    setDialogOpen(true);
  };

  /* ---------- ACTIONS ---------- */

  const buildSlots = () => [
    ...(form.burgers_qty > 0
      ? [
          {
            slot_type: "burger",
            quantity: form.burgers_qty,
            required: true,
            default_meat_quantity: form.burgers_default_meat_quantity,
            rules: [
              {
                rule_type: "allowed_default_meat_quantity",
                rule_value: JSON.stringify([form.burgers_default_meat_quantity]),
              },
              ...(!form.include_fries
                ? [{ rule_type: "no_fries", rule_value: "true" }]
                : []),
            ],
          },
        ]
      : []),
    ...(form.include_drink
      ? [{ slot_type: "drink", quantity: form.drink_qty, required: false }]
      : []),
    ...(form.include_side
      ? [{ slot_type: "side", quantity: form.side_qty, required: false }]
      : []),
  ];

  const submit = async () => {
    try {
      if (editing) {
        await updateComboWithSlots.mutateAsync({
          id: editing.id,
          name: form.name,
          price: Number(form.price),
          is_available: form.is_available,
          slots: buildSlots(),
        });
      } else {
        await createComboWithSlots.mutateAsync({
          name: form.name,
          price: Number(form.price),
          is_available: form.is_available,
          slots: buildSlots(),
        });
      }

      closeDialog();
    } catch {
      /* react-query maneja el error */
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCombo.mutateAsync(deleting.id);
      closeDelete();
    } catch {
      /* handled by react-query */
    }
  };

  const isSaving = createComboWithSlots.isPending || updateComboWithSlots.isPending;
  const isDeleting = deleteCombo.isPending;

  /* ---------- UI ---------- */

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header
        title={vertical.labels.pages.combos.title}
        subtitle={vertical.labels.pages.combos.subtitle}
      />

      <div className="p-4 flex justify-end bg-background">
        <Button onClick={openCreate} disabled={isSaving}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo combo
        </Button>
      </div>

      <div
        className="flex-1 overflow-auto p-6 ios-gl
      ass rounded-lg bg-card"
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-center text-destructive py-20">
            Error cargando combos
          </p>
        ) : combos?.length ? (
          <div className="space-y-2">
            {combos.map((combo) => (
              <Card
                key={combo.id}
                className={cn(
                  "group bg-card",
                  !combo.is_available && "opacity-50",
                )}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{combo.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(combo.price)}
                    </p>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button variant="ghost" size="icon">
                      <Layers className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSaving}
                      onClick={() => openEdit(combo)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isDeleting}
                      className="text-destructive"
                      onClick={() => {
                        setDeleting(combo);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-20">
            No hay combos creados
          </p>
        )}
      </div>

      {/* ---------- CREATE / EDIT ---------- */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="ios-glass rounded-2xl w-full max-w-2xl!">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar combo" : "Nuevo combo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Datos básicos */}
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: 2x Triples"
              />
            </div>

            <div className="space-y-2">
              <Label>Precio</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="Ej: 22000"
              />
            </div>

            {/* Estructura */}
            <div className="border rounded-xl p-4 space-y-4">
              <p className="text-sm font-medium">Estructura del combo</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Cantidad de hamburguesas</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Ej: 2"
                    value={form.burgers_qty}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        burgers_qty: Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Cuántas hamburguesas incluye
                  </p>
                </div>

                <div className="space-y-1">
                  <Label>Carnes por hamburguesa</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    placeholder="Ej: 2 (doble) o 3 (triple)"
                    value={form.burgers_default_meat_quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        burgers_default_meat_quantity: Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    1=simple, 2=doble, 3=triple
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.include_fries}
                  onCheckedChange={(v) =>
                    setForm({ ...form, include_fries: v })
                  }
                />
                <Label>Incluye papas</Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.include_drink}
                    onCheckedChange={(v) =>
                      setForm({ ...form, include_drink: v })
                    }
                  />
                  <Label>Incluye bebida</Label>
                </div>
                {form.include_drink && (
                  <div className="ml-10 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Cantidad de bebidas
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={form.drink_qty}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          drink_qty: Math.max(1, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.include_side}
                    onCheckedChange={(v) =>
                      setForm({ ...form, include_side: v })
                    }
                  />
                  <Label>Incluye acompañamiento</Label>
                </div>
                {form.include_side && (
                  <div className="ml-10 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Cantidad de acompañamientos
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={form.side_qty}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          side_qty: Math.max(1, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_available}
                onCheckedChange={(v) => setForm({ ...form, is_available: v })}
              />
              <Label>Disponible</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              disabled={!form.name || !form.price || isSaving}
              onClick={submit}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- DELETE ---------- */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !o && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleting?.name}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive"
              onClick={confirmDelete}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
