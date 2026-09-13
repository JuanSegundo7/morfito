"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { useOrderWizardContext } from "../order-wizard-context";
import { SelectedBurger } from "../hooks/use-combo-selection";
export function SelectedBurgerCard({ item }: { item: SelectedBurger }) {
  const { setSelectedBurgers } = useOrderWizardContext();

  const updateQty = (delta: number) => {
    setSelectedBurgers((prev) =>
      prev
        .map((b) =>
          b.id === item.id
            ? { ...b, quantity: Math.max(0, b.quantity + delta) }
            : b,
        )
        .filter((b) => b.quantity > 0),
    );
  };

  return (
    <Card>
      <CardContent className="p-3 flex justify-between items-center">
        <div>
          <p className="font-medium">{item.burger.name}</p>
          <p className="text-subheadline text-muted-foreground">
            {formatCurrency(item.burger.base_price)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => updateQty(-1)}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-subheadline">{item.quantity}</span>
          <Button size="icon" variant="outline" onClick={() => updateQty(1)}>
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            onClick={() => updateQty(-item.quantity)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
