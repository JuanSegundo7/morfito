"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { formatCurrency } from "@/lib/utils/format";

// Settings port from jebbs-dashboard's pedidos-card.tsx. Only
// default_delivery_fee is ported: scripts/048-app-settings.sql's "WHY THIS
// TABLE HAS NO pedidosya_commission_pct / default_delivery_minutes" is
// explicit that neither column exists in morfito's app_settings — a flat
// PedidosYa % would regress morfito's own per-channel commission model
// (lib/utils/commission.ts), and default_delivery_minutes has no caller on
// this branch. Do not add UI for either without adding the column first.
export function PedidosCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();

  const [isEditing, setIsEditing] = useState(false);
  const [fieldInput, setFieldInput] = useState("");

  const startEdit = () => {
    setFieldInput(String(settings.default_delivery_fee));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setFieldInput("");
  };

  const saveDeliveryFee = () => {
    const parsed = Number(fieldInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un valor válido");
      return;
    }
    updateSettings.mutate({ default_delivery_fee: parsed });
    setIsEditing(false);
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Pedidos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Costo de delivery por defecto</p>
            <p className="text-caption text-muted-foreground">Se usa como valor inicial al crear un pedido con envío</p>
          </div>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="text"
                inputMode="decimal"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-28"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDeliveryFee();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={saveDeliveryFee}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="font-bold text-primary" onClick={startEdit}>
              {formatCurrency(settings.default_delivery_fee)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
