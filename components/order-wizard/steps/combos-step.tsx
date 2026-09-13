import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Burger, Extra } from "@/lib/types";
import { SelectedBurgerCard } from "@/components/orders/burger-item-card";
import { ExtraSelector } from "../components/extra-selector";
import { ComboSnapshot, ComboWithSlots } from "@/lib/types/combo-types";

interface CombosStepProps {
  availableCombos: ComboWithSlots[];
  onAddCombo: (combo: ComboWithSlots) => void;
  onRemoveCombo: (comboId: string) => void;

  selectedCombos: Array<{
    id: string;
    combo: ComboWithSlots | ComboSnapshot;
    quantity: number;
    slots: Array<{
      slotId: string;
      slotType: "burger" | "drink" | "side";
      maxQuantity: number;
      minQuantity: number;
      defaultMeatCount?: number;
      burgers: Array<{
        id: string;
        burger: Burger;
        quantity: number;
        meatCount: number;
        friesQuantity: number;
        isVeggie?: boolean;
        removedIngredients: string[];
        selectedExtras: { extra: Extra; quantity: number }[];
      }>;
      selectedExtras: Extra[];
    }>;
  }>;

  availableBurgers: Burger[];
  availableSides: Extra[];

  getRemainingQuantity: (comboId: string, slotId: string) => number;
  canAddBurgerToSlot: (comboId: string, slotId: string, burger: Burger) => boolean;

  onAddBurgerToSlot: (comboId: string, slotId: string, burger: Burger) => void;
  onRemoveBurgerFromSlot: (comboId: string, slotId: string, burgerItemId: string) => void;
  onIncreaseBurgerQty: (comboId: string, slotId: string, burgerItemId: string) => void;
  onDecreaseBurgerQty: (comboId: string, slotId: string, burgerItemId: string) => void;
  onUpdateBurgerMeat: (comboId: string, slotId: string, burgerItemId: string, meatCount: number) => void;
  onUpdateBurgerFries: (comboId: string, slotId: string, burgerItemId: string, delta: number) => void;
  onToggleBurgerVeggie: (comboId: string, slotId: string, burgerItemId: string) => void;
  onToggleBurgerIngredient: (comboId: string, slotId: string, burgerItemId: string, ingredient: string) => void;
  onToggleBurgerExtra: (comboId: string, slotId: string, burgerItemId: string, extra: Extra) => void;
  onUpdateBurgerExtraQty: (comboId: string, slotId: string, burgerItemId: string, extraId: string, delta: number) => void;
  onSelectExtraForSlot: (comboId: string, slotId: string, extra: Extra) => void;
  onRemoveExtraFromSlot: (comboId: string, slotId: string, extra: Extra) => void;

  expandedBurgerId: string | null;
  onToggleBurgerExpanded: (burgerItemId: string) => void;

  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  extrasByCategory: Record<string, Extra[]>;
}

export function CombosStep({
  availableCombos,
  onAddCombo,
  onRemoveCombo,
  selectedCombos,
  availableBurgers,
  availableSides,
  getRemainingQuantity,
  canAddBurgerToSlot,
  onAddBurgerToSlot,
  onRemoveBurgerFromSlot,
  onIncreaseBurgerQty,
  onDecreaseBurgerQty,
  onUpdateBurgerMeat,
  onUpdateBurgerFries,
  onToggleBurgerVeggie,
  onToggleBurgerIngredient,
  onToggleBurgerExtra,
  onUpdateBurgerExtraQty,
  onSelectExtraForSlot,
  onRemoveExtraFromSlot,
  expandedBurgerId,
  onToggleBurgerExpanded,
  meatExtra,
  friesExtra,
  extrasByCategory,
}: CombosStepProps) {
  // Cantidad de instancias por combo id para el badge
  const comboCount = selectedCombos.reduce(
    (acc, c) => {
      acc[c.combo.id] = (acc[c.combo.id] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      {/* Available Combos */}
      <div>
        <h3 className="text-subheadline font-medium mb-3">
          Combos disponibles (opcional)
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {availableCombos
            .filter((c) => c.is_available)
            .map((combo) => {
              const qty = comboCount[combo.id] ?? 0;
              return (
                <Card
                  key={combo.id}
                  className={cn(
                    "cursor-pointer transition-all bg-card relative active:scale-[0.98] active:duration-75",
                    qty > 0
                      ? "ring-2 ring-primary border-primary"
                      : "hover:shadow-sm",
                  )}
                  onClick={() => onAddCombo(combo)}
                >
                  <CardContent className="p-3">
                    {/* ✅ Badge igual que en burgers */}
                    {qty > 0 && (
                      <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-caption">
                        {qty}
                      </Badge>
                    )}
                    <p className="font-medium">{combo.name}</p>
                    <p className="text-subheadline font-semibold text-primary">
                      {formatCurrency(combo.price)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>

      {/* Selected Combos */}
      {selectedCombos.map((comboInstance) => (
        <div key={comboInstance.id} className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="font-medium text-subheadline">{comboInstance.combo.name}</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={() => onRemoveCombo(comboInstance.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {comboInstance.slots.map((slot) => {
            if (slot.slotType === "burger") {
              const remaining = getRemainingQuantity(comboInstance.id, slot.slotId);

              return (
                <Card key={slot.slotId}>
                  <CardContent className="space-y-3 p-4">
                    <h5 className="text-subheadline font-medium">
                      Hamburguesas ({remaining} disponibles)
                    </h5>

                    <div className="space-y-2">
                      {slot.burgers.map((item) => (
                        <SelectedBurgerCard
                          key={item.id}
                          item={item}
                          expanded={expandedBurgerId === item.id}
                          meatExtra={meatExtra}
                          friesExtra={friesExtra}
                          extrasByCategory={extrasByCategory}
                          baseMeatCount={slot.defaultMeatCount}
                          baseFriesCount={undefined}
                          onToggleExpand={() => onToggleBurgerExpanded(item.id)}
                          onUpdateQuantity={(d) =>
                            d > 0
                              ? onIncreaseBurgerQty(comboInstance.id, slot.slotId, item.id)
                              : onDecreaseBurgerQty(comboInstance.id, slot.slotId, item.id)
                          }
                          onUpdateMeatCount={(d) => {
                            const min = slot.defaultMeatCount ?? 1;
                            const newCount = item.meatCount + d;
                            if (newCount < min) return;
                            onUpdateBurgerMeat(comboInstance.id, slot.slotId, item.id, newCount);
                          }}
                          onUpdateFriesCount={(d) =>
                            onUpdateBurgerFries(comboInstance.id, slot.slotId, item.id, d)
                          }
                          onToggleVeggie={() =>
                            onToggleBurgerVeggie(comboInstance.id, slot.slotId, item.id)
                          }
                          onToggleIngredient={(ingredient) =>
                            onToggleBurgerIngredient(comboInstance.id, slot.slotId, item.id, ingredient)
                          }
                          onToggleExtra={(extra) =>
                            onToggleBurgerExtra(comboInstance.id, slot.slotId, item.id, extra)
                          }
                          onUpdateExtraQuantity={(extraId, d) =>
                            onUpdateBurgerExtraQty(comboInstance.id, slot.slotId, item.id, extraId, d)
                          }
                          onRemove={() =>
                            onRemoveBurgerFromSlot(comboInstance.id, slot.slotId, item.id)
                          }
                        />
                      ))}
                    </div>

                    {remaining > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {availableBurgers?.map((burger) => {
                          if (!canAddBurgerToSlot(comboInstance.id, slot.slotId, burger))
                            return null;

                          const qty = slot.burgers.filter(
                            (b) => b.burger.id === burger.id,
                          ).length;

                          return (
                            <Card
                              key={burger.id}
                              className={cn(
                                "cursor-pointer transition-all bg-card relative active:scale-[0.98] active:duration-75",
                                qty > 0
                                  ? "ring-2 ring-primary border-primary animate-in zoom-in-95 duration-300"
                                  : "hover:shadow-sm",
                              )}
                              onClick={() =>
                                onAddBurgerToSlot(comboInstance.id, slot.slotId, burger)
                              }
                            >
                              <CardContent className="p-3">
                                {qty > 0 && (
                                  <Badge className="absolute -top-2 -right-2 h-5 w-5 animate-in zoom-in-50 fade-in rounded-full p-0 flex items-center justify-center text-caption duration-200">
                                    {qty}
                                  </Badge>
                                )}
                                <p className="font-medium">{burger.name}</p>
                                <p className="text-subheadline text-muted-foreground">
                                  {formatCurrency(burger.base_price)}
                                </p>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            if (slot.slotType === "drink") {
              const drinkExtras = extrasByCategory["drink"] || [];
              return (
                <Card key={slot.slotId}>
                  <CardContent className="p-4">
                    <ExtraSelector
                      title="Elegir Bebida"
                      extras={drinkExtras}
                      selectedExtraIds={slot.selectedExtras.map((e) => e.id)}
                      maxQuantity={slot.maxQuantity}
                      onSelect={(extra) =>
                        onSelectExtraForSlot(comboInstance.id, slot.slotId, extra)
                      }
                      onRemoveOne={(extra) =>
                        onRemoveExtraFromSlot(comboInstance.id, slot.slotId, extra)
                      }
                      required={slot.minQuantity > 0}
                    />
                  </CardContent>
                </Card>
              );
            }

            if (slot.slotType === "side") {
              const sideExtras = availableSides;
              return (
                <Card key={slot.slotId}>
                  <CardContent className="p-4">
                    <ExtraSelector
                      title="Elegir Acompañamiento"
                      extras={sideExtras}
                      selectedExtraIds={slot.selectedExtras.map((e) => e.id)}
                      maxQuantity={slot.maxQuantity}
                      onSelect={(extra) =>
                        onSelectExtraForSlot(comboInstance.id, slot.slotId, extra)
                      }
                      onRemoveOne={(extra) =>
                        onRemoveExtraFromSlot(comboInstance.id, slot.slotId, extra)
                      }
                      required={slot.minQuantity > 0}
                    />
                  </CardContent>
                </Card>
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}