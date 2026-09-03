import { Card, CardContent } from "@/components/ui/card";
import type { Burger } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { useOrderWizardContext } from "../order-wizard-context";
import { nanoid } from "nanoid";

export function BurgerCard({ burger }: { burger: Burger }) {
  const { selectedBurgers, setSelectedBurgers } = useOrderWizardContext();

  const addBurger = () => {
    const exists = selectedBurgers.find((b) => b.burger.id === burger.id);

    if (exists) {
      setSelectedBurgers((prev) =>
        prev.map((b) =>
          b.burger.id === burger.id ? { ...b, quantity: b.quantity + 1 } : b,
        ),
      );
    } else {
      setSelectedBurgers((prev) => [
        ...prev,
        {
          id: nanoid(), // 🆕 Faltaba
          burger,
          quantity: 1,
          meatCount: burger.default_meat_quantity,
          friesQuantity: burger.default_fries_quantity, // 🆕 Faltaba
          meatPriceAdjustment: 0,
          removedIngredients: [],
          selectedExtras: [],
        },
      ]);
    }
  };

  return (
    <Card
      onClick={addBurger}
      className="cursor-pointer transition hover:shadow-sm active:scale-[0.98] active:duration-75"
    >
      <CardContent className="p-3">
        <p className="font-medium">{burger.name}</p>
        <p className="text-sm font-semibold text-primary">
          {formatCurrency(burger.base_price)}
        </p>
      </CardContent>
    </Card>
  );
}
