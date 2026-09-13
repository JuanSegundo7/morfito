import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, DollarSign, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface DiscountSectionProps {
  discountType: "amount" | "percentage" | "none";
  discountValue: number;
  onDiscountTypeChange: (type: "amount" | "percentage" | "none") => void;
  onDiscountValueChange: (value: number) => void;
  subtotal: number;
  discountAmount: number;
}

export function DiscountSection({
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  subtotal,
  discountAmount,
}: DiscountSectionProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-subheadline font-medium">Descuento</h3>
          {discountType !== "none" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onDiscountTypeChange("none");
                onDiscountValueChange(0);
              }}
              className="h-7 text-caption text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3 mr-1" />
              Quitar
            </Button>
          )}
        </div>

        {/* Tipo de descuento */}
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            variant={discountType === "amount" ? "default" : "outline"}
            onClick={() => {
              onDiscountTypeChange("amount");
              if (discountValue === 0) onDiscountValueChange(1000);
            }}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            Monto fijo
          </Button>

          <Button
            type="button"
            className="flex-1"
            variant={discountType === "percentage" ? "default" : "outline"}
            onClick={() => {
              onDiscountTypeChange("percentage");
              if (discountValue === 0) onDiscountValueChange(10);
            }}
          >
            <Percent className="h-4 w-4 mr-1" />
            Porcentaje
          </Button>
        </div>

        {/* Input de valor */}
        {discountType !== "none" && (
          <div className="space-y-2">
            <Label htmlFor="discount-value">
              {discountType === "amount"
                ? "Monto del descuento"
                : "Porcentaje de descuento"}
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="discount-value"
                type="number"
                min={0}
                max={discountType === "percentage" ? 100 : subtotal}
                value={discountValue}
                onChange={(e) => onDiscountValueChange(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-subheadline text-muted-foreground w-8">
                {discountType === "percentage" ? "%" : "$"}
              </span>
            </div>

            {/* Preview del descuento */}
            {discountValue > 0 && (
              <div className="bg-[var(--status-paid-tint)] border border-[var(--status-paid)]/30 rounded-md p-3">
                <div className="flex justify-between items-center text-subheadline">
                  <span className="text-[var(--status-paid)]">
                    Descuento aplicado:
                  </span>
                  <span className="font-semibold text-[var(--status-paid)]">
                    -{formatCurrency(discountAmount)}
                  </span>
                </div>
                {discountType === "percentage" && (
                  <p className="text-caption text-[var(--status-paid)]/80 mt-1">
                    {discountValue}% de {formatCurrency(subtotal)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
