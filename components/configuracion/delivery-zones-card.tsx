"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Check, X, Plus, Map } from "lucide-react";
import { DeliveryZonePolygonEditorDialog } from "@/components/configuracion/delivery-zone-polygon-editor-dialog";
import { toast } from "sonner";
import {
  useDeliveryZones,
  useCreateDeliveryZone,
  useUpdateDeliveryZone,
  useDeactivateDeliveryZone,
} from "@/lib/hooks/use-delivery-zones";
import { formatCurrency } from "@/lib/utils/format";
import type { DeliveryZone } from "@/lib/types";

export function DeliveryZonesCard() {
  const { data: zones } = useDeliveryZones();
  const createZone = useCreateDeliveryZone();
  const updateZone = useUpdateDeliveryZone();
  const deactivateZone = useDeactivateDeliveryZone();

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFee, setNewFee] = useState("");

  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState("");

  // Mismo patrón que editingZoneId/feeInput arriba, para nombre+descripción
  // -- estado aparte porque una fila puede tener uno de los dos modos de
  // edición abierto a la vez, nunca los dos.
  const [editingNameZoneId, setEditingNameZoneId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");

  const [editingShapeZone, setEditingShapeZone] = useState<DeliveryZone | null>(null);

  const startAdd = () => {
    setNewName("");
    setNewDescription("");
    setNewFee("");
    setIsAdding(true);
  };

  const cancelAdd = () => {
    setIsAdding(false);
  };

  const saveAdd = () => {
    const name = newName.trim();
    const fee = Number(newFee.trim().replace(",", "."));

    if (!name) {
      toast.error("Ingresá un nombre válido");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error("Ingresá un costo válido");
      return;
    }

    createZone.mutate(
      {
        name,
        description: newDescription.trim() || null,
        fee,
      },
      {
        onSuccess: () => setIsAdding(false),
      },
    );
  };

  const startEditFee = (zone: DeliveryZone) => {
    setFeeInput(String(zone.fee));
    setEditingZoneId(zone.id);
  };

  const cancelEditFee = () => {
    setEditingZoneId(null);
    setFeeInput("");
  };

  const saveEditFee = (zone: DeliveryZone) => {
    const parsed = Number(feeInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un costo válido");
      return;
    }
    updateZone.mutate({ id: zone.id, fee: parsed });
    setEditingZoneId(null);
  };

  const startEditName = (zone: DeliveryZone) => {
    setNameInput(zone.name);
    setDescriptionInput(zone.description ?? "");
    setEditingNameZoneId(zone.id);
  };

  const cancelEditName = () => {
    setEditingNameZoneId(null);
    setNameInput("");
    setDescriptionInput("");
  };

  const saveEditName = (zone: DeliveryZone) => {
    const name = nameInput.trim();
    if (!name) {
      toast.error("Ingresá un nombre válido");
      return;
    }
    updateZone.mutate({ id: zone.id, name, description: descriptionInput.trim() || null });
    setEditingNameZoneId(null);
  };

  const toggleActive = (zone: DeliveryZone, checked: boolean) => {
    if (checked) {
      updateZone.mutate({ id: zone.id, is_active: true });
    } else {
      deactivateZone.mutate(zone.id);
    }
  };

  const sortedZones = [...(zones ?? [])].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return 0;
  });

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Zonas de envío</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-muted-foreground -mt-1">
          Definí las zonas de entrega y cuánto cobrás por el envío en cada una
        </p>

        {sortedZones.map((zone) =>
          editingNameZoneId === zone.id ? (
            // Fila entera pasa a modo edición vertical (mismo criterio
            // visual que el bloque "Agregar zona" más abajo) en vez de
            // meter dos inputs en la columna angosta del nombre.
            <div key={zone.id} className="rounded-lg bg-secondary/30 p-3 space-y-2">
              <Input
                type="text"
                placeholder="Nombre de la zona"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditName(zone);
                  if (e.key === "Escape") cancelEditName();
                }}
              />
              <Input
                type="text"
                placeholder="Descripción (opcional)"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditName(zone);
                  if (e.key === "Escape") cancelEditName();
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary"
                  onClick={() => saveEditName(zone)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEditName}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div key={zone.id} className={cardRowClass(zone.is_active)}>
              {/* min-w-[140px] en vez de solo flex-1 min-w-0: sin un piso de
                  ancho, esta columna competía por espacio contra los
                  controles de ancho fijo (precio/switch) y en pantallas
                  angostas terminaba comprimida a 0px -- el nombre de la zona
                  desaparecía. flex-wrap en el contenedor deja que los
                  controles bajen a una segunda línea en vez de exprimir el
                  nombre. Es un <button>: clickear el nombre/descripción abre
                  el modo de edición vertical de arriba. */}
              <button
                type="button"
                className="-mx-1 min-w-[140px] flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/50"
                onClick={() => startEditName(zone)}
              >
                <p className="font-medium truncate">{zone.name}</p>
                {zone.description && (
                  <p className="text-caption text-muted-foreground truncate">
                    {zone.description}
                  </p>
                )}
              </button>

              <div className="flex flex-wrap items-center gap-3">
                {editingZoneId === zone.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      className="w-24"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditFee(zone);
                        if (e.key === "Escape") cancelEditFee();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      onClick={() => saveEditFee(zone)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={cancelEditFee}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="font-bold text-primary"
                    onClick={() => startEditFee(zone)}
                  >
                    {formatCurrency(zone.fee)}
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 ${zone.map_polygon ? "text-primary" : ""}`}
                  onClick={() => setEditingShapeZone(zone)}
                  title="Editar forma"
                  aria-label={`Editar forma de ${zone.name}`}
                >
                  <Map className="h-4 w-4" />
                </Button>

                <Switch
                  checked={zone.is_active}
                  onCheckedChange={(checked) => toggleActive(zone, checked)}
                  title={zone.is_active ? "Desactivar zona" : "Reactivar zona"}
                />
              </div>
            </div>
          ),
        )}

        {isAdding ? (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
            <Input
              type="text"
              placeholder="Nombre de la zona"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <Input
              type="text"
              placeholder="Descripción (opcional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Costo"
                value={newFee}
                onChange={(e) => setNewFee(e.target.value)}
                className="w-28"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdd();
                  if (e.key === "Escape") cancelAdd();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary"
                onClick={saveAdd}
                disabled={createZone.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelAdd}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={startAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Agregar zona
          </Button>
        )}
      </CardContent>

      {editingShapeZone && (
        <DeliveryZonePolygonEditorDialog
          // Look up the live zone so the dialog sees fresh map_polygon after saves.
          zone={zones?.find((z) => z.id === editingShapeZone.id) ?? editingShapeZone}
          open
          onOpenChange={(open) => {
            if (!open) setEditingShapeZone(null);
          }}
        />
      )}
    </Card>
  );
}

function cardRowClass(isActive: boolean) {
  return [
    "flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3",
    isActive ? "" : "opacity-50",
  ]
    .filter(Boolean)
    .join(" ");
}
