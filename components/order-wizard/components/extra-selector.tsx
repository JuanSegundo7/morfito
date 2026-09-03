"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Extra } from "@/lib/types";

interface Props {
  title: string;
  extras: Extra[];
  selectedExtraIds: string[];
  maxQuantity?: number;
  onSelect: (extra: Extra) => void;
  onRemoveOne?: (extra: Extra) => void;
  required?: boolean;
}

export function ExtraSelector({
  title,
  extras,
  selectedExtraIds,
  maxQuantity = 1,
  onSelect,
  onRemoveOne,
  required = false,
}: Props) {
  if (extras.length === 0) {
    return null;
  }

  const remaining = maxQuantity - selectedExtraIds.length;
  const isAtMax = remaining <= 0;

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        {title}
        {maxQuantity > 1 && (
          <span className="ml-1 normal-case text-muted-foreground">
            ({remaining} disponibles)
          </span>
        )}
        {required && <span className="text-destructive ml-1">*</span>}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {extras.map((extra) => {
          const qty = selectedExtraIds.filter((id) => id === extra.id).length;
          const isSelected = qty > 0;
          const isDisabled = isAtMax && !isSelected;

          return (
            <Card
              key={extra.id}
              className={cn(
                "transition-all",
                isDisabled
                  ? "opacity-40 cursor-not-allowed"
                  : "cursor-pointer hover:shadow-md active:scale-[0.98] active:duration-75",
                isSelected && "ring-2 ring-primary bg-primary/5",
              )}
              onClick={() => !isDisabled && onSelect(extra)}
            >
              <CardContent className="p-3 relative">
                {/* Badge de cantidad */}
                {isSelected && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {onRemoveOne && (
                      <button
                        className="h-5 w-5 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/20 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveOne(extra);
                        }}
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                    )}
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                      {qty > 1 ? (
                        <span className="text-[10px] font-bold">{qty}</span>
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                )}

                <p className="font-medium text-sm pr-14">{extra.name}</p>

                {extra.price > 0 ? (
                  <p className="text-xs text-primary mt-0.5">
                    +{formatCurrency(extra.price)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Incluido
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {required && selectedExtraIds.length === 0 && (
        <p className="text-xs text-destructive mt-2">
          ⚠️ Debes elegir una opción
        </p>
      )}
    </div>
  );
}
