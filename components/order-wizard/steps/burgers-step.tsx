import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Burger, Extra } from "@/lib/types";
import { SelectedBurgerCard } from "@/components/orders/burger-item-card";

interface BurgersStepProps {
  availableBurgers: Burger[];
  onAddBurger: (burger: Burger) => void;

  selectedBurgers: Array<{
    id: string;
    burger: Burger;
    quantity: number;
    meatCount: number;
    friesQuantity: number;
    isVeggie?: boolean;
    meatPriceAdjustment: number;
    removedIngredients: string[];
    selectedExtras: { extra: Extra; quantity: number }[];
  }>;

  onRemoveBurger: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onToggleIngredient: (itemId: string, ingredient: string) => void;
  onUpdateMeatCount: (itemId: string, delta: number) => void;
  onUpdateFriesQuantity: (itemId: string, delta: number) => void;
  onToggleVeggie: (itemId: string) => void;
  onToggleExtra: (itemId: string, extra: Extra) => void;
  onUpdateExtraQuantity: (itemId: string, extraId: string, delta: number) => void;

  expandedBurger: string | null;
  onToggleExpanded: (itemId: string) => void;

  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  extrasByCategory: Record<string, Extra[]>;
}

export function BurgersStep({
  availableBurgers,
  onAddBurger,
  selectedBurgers,
  onRemoveBurger,
  onUpdateQuantity,
  onToggleIngredient,
  onUpdateMeatCount,
  onUpdateFriesQuantity,
  onToggleVeggie,
  onToggleExtra,
  onUpdateExtraQuantity,
  expandedBurger,
  onToggleExpanded,
  meatExtra,
  friesExtra,
  extrasByCategory,
}: BurgersStepProps) {
  // Cuenta cuántas veces fue agregada cada burger
  const burgerCount = selectedBurgers.reduce(
    (acc, item) => {
      acc[item.burger.id] = (acc[item.burger.id] ?? 0) + item.quantity;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      {/* Available Burgers */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Seleccionar hamburguesas</h3>
        <div className="grid grid-cols-2 gap-3">
          {availableBurgers?.map((burger) => {
            const qty = burgerCount[burger.id] ?? 0;
            return (
              <Card
                key={burger.id}
                className={cn(
                  "cursor-pointer transition-all bg-card relative active:scale-[0.98] active:duration-75",
                  qty > 0
                    ? "ring-2 ring-primary border-primary"
                    : "hover:shadow-sm",
                )}
                onClick={() => onAddBurger(burger)}
              >
                <CardContent className="p-3">
                  {qty > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {qty}
                    </Badge>
                  )}
                  <p className="font-medium">{burger.name}</p>
                  <p className="text-sm font-semibold text-primary">
                    {formatCurrency(burger.base_price)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Selected Burgers */}
      {selectedBurgers.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">
              Tu pedido ({selectedBurgers.length} items)
            </h3>
            <div className="space-y-3">
              {selectedBurgers.map((item) => (
                <SelectedBurgerCard
                  key={item.id}
                  item={item}
                  expanded={expandedBurger === item.id}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  extrasByCategory={extrasByCategory}
                  onToggleExpand={() => onToggleExpanded(item.id)}
                  onUpdateQuantity={(d) => onUpdateQuantity(item.id, d)}
                  onRemove={() => onRemoveBurger(item.id)}
                  onToggleIngredient={(ing) => onToggleIngredient(item.id, ing)}
                  onUpdateMeatCount={(d) => onUpdateMeatCount(item.id, d)}
                  onUpdateFriesCount={(d) => onUpdateFriesQuantity(item.id, d)}
                  onToggleVeggie={() => onToggleVeggie(item.id)}
                  onToggleExtra={(extra) => onToggleExtra(item.id, extra)}
                  onUpdateExtraQuantity={(extraId, d) =>
                    onUpdateExtraQuantity(item.id, extraId, d)
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}