import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Extra } from "@/lib/types";
import { SelectedSide } from "../hooks/use-side-selection";

interface SidesStepProps {
  availableSides: Extra[];
  selectedSides: SelectedSide[];
  extrasByCategory: Record<string, Extra[]>;
  onAddSide: (extra: Extra) => void;
  onRemoveSide: (id: string) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onToggleExpanded: (id: string) => void;
  onToggleExtra: (id: string, extra: Extra) => void;
  onUpdateExtraQuantity: (id: string, extraId: string, delta: number) => void;
}

export function SidesStep({
  availableSides,
  selectedSides,
  extrasByCategory,
  onAddSide,
  onRemoveSide,
  onUpdateQuantity,
  onToggleExpanded,
  onToggleExtra,
  onUpdateExtraQuantity,
}: SidesStepProps) {
  return (
    <div className="space-y-6">
      {/* Available sides */}
      <div>
        <h3 className="mb-1 text-sm font-medium">Acompañamientos</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Nuggets, aros de cebolla, papas y más. Podés agregar varios.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {availableSides.map((side) => {
            const selectedItem = selectedSides.find(
              (s) => s.extra.id === side.id,
            );
            const qty = selectedItem?.quantity ?? 0;

            return (
              <Card
                key={side.id}
                className={cn(
                  "cursor-pointer transition-all bg-card relative active:scale-[0.98] active:duration-75",
                  qty > 0
                    ? "ring-2 ring-primary border-primary"
                    : "hover:shadow-sm",
                )}
                onClick={() => onAddSide(side)}
              >
                <CardContent className="p-3">
                  {/* ✅ Badge igual que en burgers */}
                  {qty > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {qty}
                    </Badge>
                  )}
                  <p className="font-medium text-sm leading-tight">
                    {side.name}
                  </p>
                  <p className="text-sm font-semibold text-primary mt-1">
                    {formatCurrency(side.price)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Selected sides — sin header de total (se muestra en la barra global del drawer) */}
      {selectedSides.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Seleccionados</h3>

          <div className="space-y-3">
            {selectedSides.map((item) => {
              const extrasPrice = (item.selectedExtras ?? []).reduce(
                (acc, e) => acc + e.extra.price * e.quantity,
                0,
              );

              return (
                <Card key={item.id} className="bg-card">
                  <CardContent className="p-3 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.extra.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.extra.price)} c/u
                          {extrasPrice > 0 && (
                            <span className="text-primary font-medium">
                              {" "}· +{formatCurrency(extrasPrice)} extras
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateQuantity(item.id, -1);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <span className="w-5 text-center text-sm font-medium tabular-nums">
                          {item.quantity}
                        </span>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateQuantity(item.id, 1);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSide(item.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Toggle extras */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={() => onToggleExpanded(item.id)}
                    >
                      {item.expanded ? "Ocultar extras" : "Agregar extras"}
                    </Button>

                    {/* Extras panel */}
                    {item.expanded && (
                      <div className="border-t pt-3 space-y-4">
                        {Object.entries(extrasByCategory).map(
                          ([category, categoryExtras]) => (
                            <div key={category}>
                              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                {category === "extra"
                                  ? "Extras"
                                  : category === "drink"
                                    ? "Bebidas"
                                    : category === "fries"
                                      ? "Papas"
                                      : "Otros"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {categoryExtras.map((extra) => {
                                  const selected = item.selectedExtras.find(
                                    (e) => e.extra.id === extra.id,
                                  );
                                  return (
                                    <Badge
                                      key={extra.id}
                                      variant={selected ? "default" : "outline"}
                                      className="cursor-pointer bg-card"
                                      onClick={() =>
                                        onToggleExtra(item.id, extra)
                                      }
                                    >
                                      {extra.name}{" "}
                                      {extra.price > 0 &&
                                        `+${formatCurrency(extra.price)}`}
                                      {selected &&
                                        selected.quantity > 1 &&
                                        ` x${selected.quantity}`}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          ),
                        )}

                        {/* Selected extras qty controls */}
                        {(item.selectedExtras ?? []).length > 0 && (
                          <div className="space-y-1 border-t pt-2">
                            {(item.selectedExtras ?? []).map((ext) => (
                              <div
                                key={ext.extra.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-sm">{ext.extra.name}</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      onUpdateExtraQuantity(
                                        item.id,
                                        ext.extra.id,
                                        -1,
                                      )
                                    }
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-6 text-center text-xs">
                                    {ext.quantity}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      onUpdateExtraQuantity(
                                        item.id,
                                        ext.extra.id,
                                        1,
                                      )
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {availableSides.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No hay acompañamientos disponibles</p>
        </div>
      )}
    </div>
  );
}