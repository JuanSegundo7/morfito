import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { User, MapPin, Phone, Info, AlertCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { CustomerAddress } from "@/lib/types";
import { useMemo, useEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SelectedSide } from "../hooks/use-side-selection";
import type { SelectedSushiItem } from "@/lib/types/sushi-types";
import { getOrderSources, type OrderSourceConfig } from "@/lib/utils/commission";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SummaryStepProps {
  // Customer Info
  isNewCustomer: boolean;
  customerName: string;
  customerPhone?: string;
  selectedAddress?: CustomerAddress | null;
  newAddressData?: { label: string; address: string; notes: string };

  // Order Summary
  selectedBurgers: Array<{
    id: string;
    burger: {
      name: string;
      base_price: number;
      default_meat_quantity: number;
      default_fries_quantity: number;
    };
    quantity: number;
    meatCount: number;
    friesQuantity: number;
    removedIngredients: string[];
    selectedExtras: Array<{
      extra: { id: string; name: string; price: number };
      quantity: number;
    }>;
  }>;

  // "piece-selector" orderFlow (sushi) counterpart to selectedBurgers — NOT
  // orderFlow-gated here, this component just renders whichever array is
  // non-empty (same as burgers/combos/sides already coexist as independent
  // parallel blocks). In practice only one of selectedBurgers/
  // selectedSushiItems is ever populated per order.
  selectedSushiItems: SelectedSushiItem[];

  selectedCombos: Array<{
    id: string;
    combo: { name: string; price: number };
    quantity: number;
    slots: Array<{
      slotId: string;
      slotType: "burger" | "drink" | "side" | "nuggets";
      defaultMeatCount?: number;
      burgers: Array<{
        burger: {
          name: string;
          default_meat_quantity: number;
          default_fries_quantity: number;
        };
        quantity: number;
        meatCount: number;
        friesQuantity: number;
        referenceFriesQuantity?: number;
        removedIngredients: string[];
        selectedExtras: Array<{
          extra: { id: string; name: string; price: number };
          quantity: number;
        }>;
      }>;
      selectedExtras: Array<{ id: string; name: string; price: number }>;
    }>;
  }>;

  // Sides
  selectedSides: SelectedSide[];

  // Totals
  extrasTotal: number;
  orderTotal: number;
  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;

  // Delivery & Payment
  deliveryType: "delivery" | "pickup";
  onDeliveryTypeChange: (type: "delivery" | "pickup") => void;
  deliveryFee: number;
  onDeliveryFeeChange: (fee: number) => void;
  paymentMethod: "cash" | "transfer";
  onPaymentMethodChange: (method: "cash" | "transfer") => void;

  // Discount
  subtotal: number;
  discountType: "amount" | "percentage" | "none";
  discountValue: number;
  discountAmount: number;
  onDiscountTypeChange: (type: "amount" | "percentage" | "none") => void;
  onDiscountValueChange: (value: number) => void;

  // Notes
  notes: string;
  onNotesChange: (notes: string) => void;

  // Delivery Time
  deliveryTime?: string;
  onDeliveryTimeChange?: (time: string) => void;

  // Cost/stock/finance porting, PR2: order source (sales channel) + its
  // frozen commission amount, mirrored from discountType/discountAmount's
  // own "controlled value in, pre-derived amount in" prop shape above.
  source?: string | null;
  onSourceChange?: (source: string | null) => void;
  commissionAmount?: number;

  // Cost/stock/finance porting, PR3: signed flat price adjustment — own
  // field, controlled-value-in/pre-derived-amount-out shape same as
  // discount/commission above, but NOT a discount (see
  // order-price-calculator.ts's calculateOrderTotal for why it's never
  // routed through discount_type/discount_value/discount_amount).
  priceAdjustment?: number;
  onPriceAdjustmentChange?: (value: number) => void;
}

export function SummaryStep({
  isNewCustomer,
  customerName,
  customerPhone,
  selectedAddress,
  newAddressData,
  selectedBurgers,
  selectedSushiItems,
  selectedCombos,
  selectedSides,
  orderTotal,
  meatExtra,
  friesExtra,
  deliveryType,
  onDeliveryTypeChange,
  deliveryFee,
  onDeliveryFeeChange,
  paymentMethod,
  onPaymentMethodChange,
  discountType,
  discountValue,
  discountAmount,
  onDiscountTypeChange,
  onDiscountValueChange,
  subtotal,
  notes,
  onNotesChange,
  onDeliveryTimeChange,
  deliveryTime,
  source,
  onSourceChange,
  commissionAmount = 0,
  priceAdjustment = 0,
  onPriceAdjustmentChange,
}: SummaryStepProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // Cost/stock/finance porting, PR2: order sources are operator-configured
  // localStorage data (see lib/utils/commission.ts), read once on mount —
  // same "read once, no live subscription" approach the rest of the
  // wizard's localStorage-backed config (default delivery fee) already
  // uses.
  const [orderSources, setOrderSources] = useState<OrderSourceConfig[]>([]);
  useEffect(() => {
    setOrderSources(getOrderSources());
  }, []);

  const hasSourceOptions = orderSources.length > 0;
  // Channel-aware gating: the commission section only makes sense to show
  // when a source is actually selected AND that source carries a nonzero
  // commission — never a legitimate negative value, so the same simple
  // `>0` visual treatment the discount line below already uses is fine here.
  const showCommissionLine = !!source && commissionAmount > 0;
  // Cost/stock/finance porting, PR3: gated on `!== 0`, NOT the discount's
  // `> 0` gate — a negative adjustment is a legitimate, displayable value
  // here (unlike a negative discount, which is invalid input).
  const showPriceAdjustmentLine = priceAdjustment !== 0;

  // Local raw text mirrors exactly what's typed (including a lone "-" while
  // the user is mid-entry of a negative value) — the numeric prop only
  // updates once the text parses to a finite number, so typing "-" never
  // propagates NaN into settings.priceAdjustment/the order payload.
  const [priceAdjustmentInput, setPriceAdjustmentInput] = useState(
    priceAdjustment === 0 ? "" : String(priceAdjustment),
  );
  useEffect(() => {
    setPriceAdjustmentInput(priceAdjustment === 0 ? "" : String(priceAdjustment));
  }, [priceAdjustment]);

  useEffect(() => {
    let el = topRef.current?.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTo({ top: 0 });
        break;
      }
      el = el.parentElement;
    }
  }, []);

  const hasAddress = useMemo(() => {
    if (isNewCustomer) {
      return newAddressData?.address?.trim().length ?? 0 > 0;
    }
    return selectedAddress !== null;
  }, [isNewCustomer, newAddressData?.address, selectedAddress]);

  const isFullDiscount = orderTotal === 0 && discountType !== "none";

  return (
    <div ref={topRef} className="space-y-6">
      {/* Customer Info */}
      <Card className="bg-card">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-subheadline space-y-2">
            <div className="font-medium flex items-center gap-2">
              <h3 className="flex items-center gap-2 text-subheadline font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                Cliente
              </h3>
              {customerName}
            </div>

            {(newAddressData?.address || selectedAddress) && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {isNewCustomer
                      ? `${newAddressData?.label}: ${newAddressData?.address}`
                      : `${selectedAddress?.label}: ${selectedAddress?.address}`}
                  </p>
                  {(newAddressData?.notes || selectedAddress?.notes) && (
                    <p className="text-caption text-muted-foreground italic">
                      Nota:{" "}
                      {isNewCustomer
                        ? newAddressData?.notes
                        : selectedAddress?.notes}
                    </p>
                  )}
                </div>
              </div>
            )}

            {customerPhone && (
              <div className="flex items-center gap-2">
                <h3 className="flex items-center gap-2 text-subheadline font-medium">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Teléfono
                </h3>
                <span>{customerPhone}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card className="bg-card">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-subheadline font-medium">Entrega</h3>

          {source !== "pedidosya" ? (
            <>
              <div className="space-y-2">
                <Label>Método de entrega</Label>
                <RadioGroup
                  value={deliveryType}
                  onValueChange={(value: "delivery" | "pickup") =>
                    onDeliveryTypeChange(value)
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pickup" id="pickup" />
                    <Label htmlFor="pickup" className="font-normal cursor-pointer">
                      🏃 Retira en el local
                    </Label>
                  </div>

                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="delivery"
                        id="delivery"
                        disabled={!hasAddress}
                      />
                      <Label
                        htmlFor="delivery"
                        className={cn(
                          "font-normal",
                          hasAddress
                            ? "cursor-pointer"
                            : "cursor-not-allowed opacity-50",
                        )}
                      >
                        🛵 Envío a domicilio
                      </Label>
                    </div>

                    {!hasAddress && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-caption">
                              Selecciona una dirección en el paso 1 para habilitar
                              envío
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </RadioGroup>

                {!hasAddress && (
                  <div className="flex items-start gap-2 rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-3">
                    <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div className="text-caption text-orange-900 dark:text-orange-100">
                      <p className="font-medium mb-1">Envío no disponible</p>
                      <p className="text-orange-700 dark:text-orange-300">
                        {isNewCustomer
                          ? "Agrega una dirección en el paso 1 para habilitar el envío a domicilio"
                          : "Selecciona o agrega una dirección en el paso 1"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {deliveryType === "delivery" && hasAddress && (
                <div className="space-y-1">
                  <Label>Costo de envío</Label>
                  <Input
                    type="number"
                    min={0}
                    value={deliveryFee}
                    onChange={(e) => onDeliveryFeeChange(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-subheadline text-muted-foreground">
              🛵 PedidosYa gestiona su propio envío — este pedido se
              retira/gestiona por su cuenta.
            </p>
          )}

          {onDeliveryTimeChange && (
            <div className="space-y-2">
              <Label htmlFor="deliveryTime" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {deliveryType === "delivery"
                  ? "Horario de Entrega"
                  : "Horario de Retiro"}{" "}
                (Opcional)
              </Label>
              <Input
                id="deliveryTime"
                type="time"
                value={deliveryTime || ""}
                onChange={(e) => onDeliveryTimeChange(e.target.value)}
                placeholder="HH:MM"
                className="bg-card"
              />
              <p className="text-caption text-muted-foreground mt-1">
                {deliveryType === "delivery"
                  ? "Hora en que se entregará el pedido"
                  : "Hora en que el cliente retirará el pedido"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canal de venta (source) — cost/stock/finance porting, PR2 */}
      {hasSourceOptions && onSourceChange && (
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-subheadline font-medium">Canal de venta</h3>
            <Select
              value={source ?? "__none__"}
              onValueChange={(v) => onSourceChange(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="w-full bg-card">
                <SelectValue placeholder="Sin canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin canal</SelectItem>
                {orderSources.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                    {s.commissionRate > 0 ? ` (${s.commissionRate}% comisión)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showCommissionLine && (
              <div className="flex items-center justify-between text-subheadline rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-2">
                <span className="text-orange-900 dark:text-orange-100">
                  Comisión del canal
                </span>
                <span className="font-semibold text-orange-700 dark:text-orange-300">
                  -{formatCurrency(commissionAmount)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ajuste de precio (price_adjustment) — cost/stock/finance porting, PR3.
          Deliberately its own card, visually distinct (blue) from both the
          commission line above (orange) and the discount card below
          (green) — this value can be positive OR negative, unlike either
          of those. */}
      {onPriceAdjustmentChange && (
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-subheadline font-medium">Ajuste de precio</h3>
            <p className="text-caption text-muted-foreground">
              Monto fijo, positivo o negativo, distinto del descuento.
            </p>
            <Input
              type="number"
              value={priceAdjustmentInput}
              onChange={(e) => {
                const raw = e.target.value;
                setPriceAdjustmentInput(raw);
                if (raw === "") {
                  onPriceAdjustmentChange(0);
                  return;
                }
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                  onPriceAdjustmentChange(parsed);
                }
              }}
              onFocus={(e) => e.target.select()}
              placeholder="Ej: 500 o -500"
            />
            {showPriceAdjustmentLine && (
              <div className="flex items-center justify-between text-subheadline rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-2">
                <span className="text-blue-900 dark:text-blue-100">
                  Ajuste de precio
                </span>
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {priceAdjustment > 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(priceAdjustment))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discount */}
      <Card className="bg-card">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-subheadline font-medium">Descuento</h3>
          <div className="space-y-3">
            <Label>Tipo de descuento</Label>
            <RadioGroup
              value={discountType}
              onValueChange={(value: "amount" | "percentage" | "none") => {
                onDiscountTypeChange(value);
                if (value === "none") onDiscountValueChange(0);
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="discount-none" />
                <Label htmlFor="discount-none" className="font-normal cursor-pointer">
                  Sin descuento
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentage" id="discount-percentage" />
                <Label htmlFor="discount-percentage" className="font-normal cursor-pointer">
                  💸 Porcentaje (%)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="amount" id="discount-amount" />
                <Label htmlFor="discount-amount" className="font-normal cursor-pointer">
                  💰 Monto fijo ($)
                </Label>
              </div>
            </RadioGroup>

            {discountType !== "none" && (
              <div className="space-y-2">
                <Label>
                  {discountType === "percentage"
                    ? "Porcentaje de descuento"
                    : "Monto de descuento"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={discountType === "percentage" ? 100 : undefined}
                  // Show empty string when value is 0 so the field starts blank
                  value={discountValue === 0 ? "" : discountValue}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Allow empty field (treat as 0 internally)
                    onDiscountValueChange(raw === "" ? 0 : Number(raw));
                  }}
                  onFocus={(e) => {
                    // Select all text on focus so typing replaces the value
                    e.target.select();
                  }}
                  placeholder={
                    discountType === "percentage" ? "Ej: 10" : "Ej: 5000"
                  }
                />
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-subheadline rounded-md bg-[var(--status-paid-tint)] border border-[var(--status-paid)]/30 p-2">
                    <span className="text-[var(--status-paid)]">
                      Descuento aplicado
                      {isFullDiscount && (
                        <span className="ml-1 text-caption text-[var(--status-paid)]/80">
                          (incluye envío)
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-[var(--status-paid)]">
                      -{formatCurrency(isFullDiscount ? orderTotal : discountAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      
      {/* Payment Method */}
      <Card className="bg-card">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-subheadline font-medium">Método de pago</h3>
          <RadioGroup
            value={paymentMethod}
            onValueChange={(value: "cash" | "transfer") =>
              onPaymentMethodChange(value)
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cash" id="cash" />
              <Label htmlFor="cash" className="font-normal cursor-pointer">
                💵 Efectivo
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="transfer" id="transfer" />
              <Label htmlFor="transfer" className="font-normal cursor-pointer">
                🏦 Transferencia
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Order Summary */}
      <Card className="bg-card">
        <CardContent className="p-4">
          <h3 className="mb-3 text-subheadline font-medium">Pedido</h3>

          <div className="space-y-3">
            {/* Burgers */}
            {selectedBurgers.map((item) => {
              const baseMeat = item.burger.default_meat_quantity;
              const diffMeat = item.meatCount - baseMeat;
              const sizeLabel =
                item.meatCount === 1 ? "Simple"
                : item.meatCount === 2 ? "Doble"
                : item.meatCount === 3 ? "Triple"
                : item.meatCount === 4 ? "Cuádruple"
                : item.meatCount === 5 ? "Quíntuple"
                : `${item.meatCount} carnes`;

              const baseFries = item.burger.default_fries_quantity ?? 1;
              const diffFries = item.friesQuantity - baseFries;
              const basePrice = item.burger.base_price * item.quantity;

              let extrasPrice = 0;
              if (friesExtra) extrasPrice += diffFries * friesExtra.price * item.quantity;
              if (diffMeat > 0 && meatExtra) extrasPrice += diffMeat * meatExtra.price * item.quantity;
              const otherExtrasPrice = item.selectedExtras.reduce(
                (acc, ext) => acc + ext.extra.price * ext.quantity, 0,
              );
              extrasPrice += otherExtrasPrice;

              return (
                <div key={item.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.quantity}x {item.burger.name}{" "}
                        <span className="text-caption text-muted-foreground">({sizeLabel})</span>
                      </p>
                      <p className="text-caption text-muted-foreground mt-1">
                        Base: {formatCurrency(basePrice)}
                      </p>
                      <div className="mt-2 space-y-1">
                        {item.removedIngredients.length > 0 && (
                          <p className="text-caption text-muted-foreground">
                            • Sin: {item.removedIngredients.join(", ")}
                          </p>
                        )}
                        <p className="text-caption text-muted-foreground">
                          •{" "}
                          {item.friesQuantity === 0
                            ? "Sin papas"
                            : `${item.friesQuantity} ${item.friesQuantity === 1 ? "porción" : "porciones"} de papas`}
                          {friesExtra && diffFries !== 0 && (
                            <span className={cn("font-medium", diffFries < 0 ? "text-green-600 dark:text-green-400" : "text-primary")}>
                              {" "}
                              {diffFries < 0
                                ? `-${formatCurrency(Math.abs(diffFries) * friesExtra.price * item.quantity)}`
                                : `+${formatCurrency(diffFries * friesExtra.price * item.quantity)}`}
                            </span>
                          )}
                        </p>
                        {diffMeat > 0 && meatExtra && (
                          <p className="text-caption text-muted-foreground">
                            • + {diffMeat}x Medallón extra{" "}
                            <span className="text-primary font-medium">
                              +{formatCurrency(diffMeat * meatExtra.price * item.quantity)}
                            </span>
                          </p>
                        )}
                        {item.selectedExtras.map((ext) => (
                          <p key={ext.extra.id} className="text-caption text-muted-foreground">
                            • + {ext.quantity}x {ext.extra.name}{" "}
                            <span className="text-primary font-medium">
                              +{formatCurrency(ext.extra.price * ext.quantity)}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end ml-4">
                      <span className="font-semibold">
                        {formatCurrency(basePrice + extrasPrice)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Sushi Items */}
            {selectedSushiItems.map((item) => {
              const total = item.unitPrice * item.quantity;

              return (
                <div key={item.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.quantity}x {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.variantOptionLabel ?? "Sin configurar"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end ml-4">
                      <span className="font-semibold">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(selectedCombos.length > 0 || selectedSides.length > 0) && <Separator className="my-3" />}

          {/* Combos */}
          {selectedCombos.map((c) => {
            const comboBasePrice = c.combo.price * c.quantity;
            let comboExtrasPrice = 0;

            c.slots.forEach((slot) => {
              slot.burgers.forEach((burger) => {
                const burgerExtras = burger.selectedExtras.reduce(
                  (acc, ext) => acc + ext.extra.price * ext.quantity, 0,
                );
                let meatAdjustment = 0;
                if (meatExtra) {
                  const referenceMeatCount = slot.defaultMeatCount ?? burger.burger.default_meat_quantity;
                  meatAdjustment = (burger.meatCount - referenceMeatCount) * meatExtra.price;
                }
                let friesAdjustment = 0;
                if (friesExtra) {
                  const referenceFriesCount = burger.burger.default_fries_quantity ?? 1;
                  friesAdjustment = (burger.friesQuantity - referenceFriesCount) * friesExtra.price;
                }
                comboExtrasPrice += (burgerExtras + meatAdjustment + friesAdjustment) * burger.quantity;
              });
            });

            return (
              <div key={c.id} className="border-b pb-3 last:border-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{c.quantity}x {c.combo.name}</p>
                    <p className="text-caption text-muted-foreground mt-1">
                      Base: {formatCurrency(comboBasePrice)}
                    </p>
                  </div>
                  <span className="font-semibold ml-4">
                    {formatCurrency(comboBasePrice + comboExtrasPrice)}
                  </span>
                </div>

                <div className="mt-2 space-y-2">
                  {c.slots.map((slot) => (
                    <div key={slot.slotId}>
                      {slot.burgers.map((b, burgerIndex) => {
                        const referenceMeatCount = slot.defaultMeatCount ?? b.burger.default_meat_quantity;
                        const meatDiff = b.meatCount - referenceMeatCount;
                        const referenceFriesCount = b.referenceFriesQuantity ?? b.burger.default_fries_quantity ?? 1;
                        const friesDiff = b.friesQuantity - referenceFriesCount;
                        const comboSizeLabel =
                          b.meatCount === 1 ? "Simple"
                          : b.meatCount === 2 ? "Doble"
                          : b.meatCount === 3 ? "Triple"
                          : b.meatCount === 4 ? "Cuádruple"
                          : b.meatCount === 5 ? "Quíntuple"
                          : `${b.meatCount} carnes`;

                        return (
                          <div key={burgerIndex} className="ml-4 space-y-1">
                            <p className="text-subheadline font-medium text-muted-foreground">
                              • {b.quantity}x {b.burger.name}{" "}
                              <span className="text-caption">({comboSizeLabel})</span>
                            </p>
                            <div className="ml-4 space-y-0.5">
                              {b.removedIngredients.length > 0 && (
                                <p className="text-caption text-muted-foreground">
                                  • Sin: {b.removedIngredients.join(", ")}
                                </p>
                              )}
                              <p className="text-caption text-muted-foreground">
                                •{" "}
                                {b.friesQuantity === 0 ? "Sin papas"
                                  : `${b.friesQuantity} ${b.friesQuantity === 1 ? "porción" : "porciones"} de papas`}
                                {friesExtra && friesDiff !== 0 && (
                                  <span className={cn("font-medium", friesDiff < 0 ? "text-green-600 dark:text-green-400" : "text-primary")}>
                                    {" "}{friesDiff < 0
                                      ? `-${formatCurrency(Math.abs(friesDiff) * friesExtra.price * b.quantity)}`
                                      : `+${formatCurrency(friesDiff * friesExtra.price * b.quantity)}`}
                                  </span>
                                )}
                              </p>
                              {meatDiff > 0 && meatExtra && (
                                <p className="text-caption text-muted-foreground">
                                  • + {meatDiff}x Medallón extra{" "}
                                  <span className="text-primary font-medium">
                                    +{formatCurrency(meatDiff * meatExtra.price * b.quantity)}
                                  </span>
                                </p>
                              )}
                              {b.selectedExtras.map((ext) => (
                                <p key={ext.extra.id} className="text-caption text-muted-foreground">
                                  • + {ext.quantity}x {ext.extra.name}{" "}
                                  <span className="text-primary font-medium">
                                    +{formatCurrency(ext.extra.price * ext.quantity)}
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {slot.selectedExtras?.map((extra) => (
                        <div key={extra.id} className="ml-4">
                          <p className="text-subheadline font-medium text-muted-foreground">
                            •{" "}
                            {slot.slotType === "drink"
                              ? "Bebida: "
                              : slot.slotType === "side"
                                ? "Acomp.: "
                                : ""}
                            {extra.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Sides */}
          {selectedSides.map((item) => {
            const extrasPrice = (item.selectedExtras ?? []).reduce(
              (acc, e) => acc + e.extra.price * e.quantity,
              0,
            );
            const total = item.extra.price * item.quantity + extrasPrice;

            return (
              <div key={item.id} className="pb-3 last:border-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.quantity}x {item.extra.name}
                    </p>
                    <p className="text-caption text-muted-foreground mt-1">
                      {formatCurrency(item.extra.price)} c/u
                    </p>
                    {(item.selectedExtras ?? []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {(item.selectedExtras ?? []).map((ext) => (
                          <p key={ext.extra.id} className="text-caption text-muted-foreground">
                            • + {ext.quantity}x {ext.extra.name}{" "}
                            <span className="text-primary font-medium">
                              +{formatCurrency(ext.extra.price * ext.quantity)}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="font-semibold ml-4">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Totals */}
          <Separator className="my-3" />
          <div className="space-y-1 text-subheadline">
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>
                  Descuento{" "}
                  {discountType === "percentage" && `(${discountValue}%)`}
                  {isFullDiscount && (
                    <span className="ml-1 text-caption opacity-75">(incl. envío)</span>
                  )}
                </span>
                <span>-{formatCurrency(isFullDiscount ? orderTotal : discountAmount)}</span>
              </div>
            )}
            {showCommissionLine && (
              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                <span>Comisión del canal</span>
                <span>-{formatCurrency(commissionAmount)}</span>
              </div>
            )}
            {showPriceAdjustmentLine && (
              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                <span>Ajuste de precio</span>
                <span>
                  {priceAdjustment > 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(priceAdjustment))}
                </span>
              </div>
            )}
            {deliveryType === "delivery" && !isFullDiscount && (
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            {deliveryType === "delivery" && isFullDiscount && (
              <div className="flex justify-between text-muted-foreground line-through opacity-50">
                <span>Envío</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-subheadline text-muted-foreground">
              <span>Método de pago</span>
              <span>{paymentMethod === "cash" ? "Efectivo" : "Transferencia"}</span>
            </div>
          </div>

          <Separator className="my-2" />

          <div className="flex justify-between items-center">
            <span className="text-headline font-bold">Total</span>
            <span className="text-amount">{formatCurrency(orderTotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="space-y-3">
        <Label htmlFor="notes">Notas del pedido</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Instrucciones especiales..."
          rows={3}
          className="bg-white"
        />
      </div>
    </div>
  );
}