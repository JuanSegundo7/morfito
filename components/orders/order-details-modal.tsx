"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Home, MapPin, User, Edit, Clock, Phone } from "lucide-react";
import type { Order } from "@/lib/types";
import { useOrderWithItems } from "@/lib/hooks/orders/use-orders";
import { formatCurrency } from "@/lib/utils/format";
import { orderStatusConfig } from "@/lib/utils/order-status";
import { getOrderSources } from "@/lib/utils/commission";

interface OrderDetailsModalProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditOrder?: (order: Order) => void;
}

interface BurgerCustomization {
  burgerId: string;
  name: string;
  meatCount: number;
  friesQuantity: number;
  quantity: number;
  removedIngredients: string[];
  extras: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
}

type SlotType = "burger" | "drink" | "side" | "fries" | "extra";

interface ComboSlot {
  slotId: string;
  slotType: SlotType;
  burgers: BurgerCustomization[];
  selectedExtras?: Array<{
    id: string;
    name: string;
    price: number;
  }> | null;
  /** @deprecated backward compat — use selectedExtras */
  selectedExtra?: {
    id: string;
    name: string;
    quantity: number;
    price: number;
  } | null;
}

const slotMetaMap: Record<
  "drink" | "side" | "fries" | "extra",
  { label: string; icon: string }
> = {
  drink: { label: "Bebida", icon: "🥤" },
  side: { label: "Acompañamiento", icon: "🍗" },
  fries: { label: "Papas", icon: "🍟" },
  extra: { label: "Extra", icon: "➕" },
};

export function OrderDetailsModal({
  order,
  open,
  onOpenChange,
  onEditOrder,
}: OrderDetailsModalProps) {
  const { data: orderWithItems, isLoading } = useOrderWithItems(
    order?.id ?? null,
  );
  const config = order ? orderStatusConfig[order.status] : null;

  const canEdit = order && (order.status === "new" || order.status === "ready");

  console.log(order, "order");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-3">
              <DialogTitle className="font-mono text-title3">
                Pedido #{order?.order_number}
              </DialogTitle>
              {config && (
                <Badge className={config.className}>{config.label}</Badge>
              )}
            </div>

            {canEdit && onEditOrder && (
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={() => {
                  onOpenChange(false);
                  onEditOrder(order);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : orderWithItems ? (
          <div className="space-y-4">

            {/* Horario — arriba del cliente, abajo del número de pedido */}
            {orderWithItems.delivery_time && (
              <div className="flex items-center gap-2 text-subheadline font-medium text-primary bg-primary/10 px-3 py-2 rounded-md">
                <Clock className="h-4 w-4" />
                <span>
                  {orderWithItems.delivery_type === "delivery"
                    ? "🚚 Entregar a las:"
                    : "🏪 Retirar a las:"}{" "}
                  <span className="font-bold">
                    {orderWithItems.delivery_time}
                  </span>
                </span>
              </div>
            )}

            {/* Cliente Info */}
            <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-subheadline font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                {orderWithItems.customer_name}
              </div>

              {orderWithItems.customer?.phone && (
                <div className="flex items-center gap-2 text-caption text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{orderWithItems.customer.phone}</span>
                </div>
              )}

              {orderWithItems.customer_address && (
                <div className="flex items-center gap-2 text-caption text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {orderWithItems.customer_address.label} -{" "}
                    {orderWithItems.customer_address.address}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                {orderWithItems.delivery_type === "delivery" ? (
                  <>
                    <Car className="h-4 w-4" />
                    <span>Envío a domicilio</span>
                  </>
                ) : (
                  <>
                    <Home className="h-4 w-4" />
                    <span>Retira en el local</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <span>
                  {orderWithItems.payment_method === "cash"
                    ? "💵 - Efectivo"
                    : "🏦 - Transferencia"}
                </span>
              </div>
            </div>

            <Separator />

            {/* Items del pedido */}
            <div>
              <h3 className="mb-3 font-semibold">Items del pedido</h3>
              <div className="space-y-4">
                {orderWithItems.items.map((item) => {
                  let customizations: ComboSlot[] | null = null;
                  if (item.customizations) {
                    try {
                      customizations = JSON.parse(item.customizations);
                    } catch (e) {
                      console.error("Failed to parse customizations:", e);
                    }
                  }

                  const isCombo =
                    item.combo_id &&
                    customizations &&
                    Array.isArray(customizations);

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg bg-secondary/30 p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-callout">
                            {item.quantity}x {item.burger_name}
                          </p>
                        </div>
                        <p className="font-bold text-headline">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>

                      {/* COMBO */}
                      {isCombo && customizations ? (
                        <div className="space-y-3 mt-3">
                          {customizations.map((slot, slotIndex) => {
                            return (
                              <div
                                key={slot.slotId || slotIndex}
                                className="pl-3 border-l-2 border-primary/30"
                              >
                                {slot.burgers.map((burger, burgerIndex) => (
                                  <div key={burgerIndex} className="mb-3">
                                    <p className="font-medium text-subheadline">
                                      {burger.quantity}x {burger.name}
                                    </p>

                                    <div className="mt-1 space-y-0.5 text-caption text-muted-foreground">
                                      {(burger as any).isVeggie && (
                                        <p>• 🌱 Veggie</p>
                                      )}
                                      {burger.meatCount !== 2 && (
                                        <p>
                                          • {burger.meatCount}{" "}
                                          {burger.meatCount === 1
                                            ? "carne"
                                            : "carnes"}
                                        </p>
                                      )}

                                      {burger.friesQuantity === 0 && (
                                        <p>• 🍟 Sin papas</p>
                                      )}

                                      {burger.friesQuantity > 0 && (
                                        <p>• 🍟 {burger.friesQuantity}x Papas</p>
                                      )}

                                      {burger.removedIngredients.length > 0 && (
                                        <p>
                                          • Sin:{" "}
                                          {burger.removedIngredients.join(", ")}
                                        </p>
                                      )}

                                      {burger.extras.length > 0 && (
                                        <div className="mt-1">
                                          {burger.extras.map(
                                            (extra, extraIndex) => (
                                              <p key={extraIndex}>
                                                • + {extra.quantity}x{" "}
                                                {extra.name}{" "}
                                                <span className="font-medium">
                                                  (
                                                  {formatCurrency(
                                                    extra.price * extra.quantity,
                                                  )}
                                                  )
                                                </span>
                                              </p>
                                            ),
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {slot.slotType in slotMetaMap &&
                                  (() => {
                                    // Backward compat: support both selectedExtras[] and legacy selectedExtra
                                    const extras: Array<{ id?: string; name: string; price: number }> =
                                      Array.isArray(slot.selectedExtras) && slot.selectedExtras.length > 0
                                        ? slot.selectedExtras
                                        : slot.selectedExtra
                                          ? [slot.selectedExtra]
                                          : [];

                                    if (extras.length === 0) return null;

                                    const meta =
                                      slotMetaMap[
                                        slot.slotType as keyof typeof slotMetaMap
                                      ];

                                    return extras.map((se, i) => (
                                      <div key={se.id ?? i} className="mb-2">
                                        <p className="font-medium text-subheadline">
                                          {meta.icon} {meta.label}: {se.name}
                                        </p>
                                        {se.price > 0 && (
                                          <p className="text-caption text-muted-foreground">
                                            +{formatCurrency(se.price)}
                                          </p>
                                        )}
                                      </div>
                                    ));
                                  })()}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <>
                          {item.customizations &&
                            !isCombo &&
                            (() => {
                              let singleData: any = null;
                              try {
                                singleData = JSON.parse(item.customizations!);
                              } catch {}

                              if (!singleData)
                                return (
                                  <p className="mt-2 text-subheadline text-muted-foreground">
                                    {item.customizations}
                                  </p>
                                );

                              const sizeLabel =
                                singleData.meatCount === 1
                                  ? "Simple"
                                  : singleData.meatCount === 2
                                    ? "Doble"
                                    : singleData.meatCount === 3
                                      ? "Triple"
                                      : `${singleData.meatCount} carnes`;

                              return (
                                <div className="mt-2 space-y-0.5 text-caption text-muted-foreground">
                                  <p>• {sizeLabel}</p>
                                  {singleData.isVeggie && (
                                    <p>• 🌱 Veggie</p>
                                  )}

                                  {singleData.friesQuantity === 0 && (
                                    <p>• 🍟 Sin papas</p>
                                  )}
                                  {singleData.friesQuantity > 0 && (
                                    <p>
                                      • 🍟 {singleData.friesQuantity}x Papas
                                    </p>
                                  )}

                                  {singleData.removedIngredients?.length > 0 && (
                                    <p>
                                      • Sin:{" "}
                                      {singleData.removedIngredients.join(", ")}
                                    </p>
                                  )}

                                  {singleData.extras?.length > 0 &&
                                    singleData.extras.map(
                                      (extra: any, i: number) => (
                                        <p key={i}>
                                          • + {extra.quantity}x {extra.name} (
                                          {formatCurrency(
                                            extra.price * extra.quantity,
                                          )}
                                          )
                                        </p>
                                      ),
                                    )}
                                </div>
                              );
                            })()}
                        </>
                      )}

                      {/* Extras del item */}
                      {item.extras && item.extras.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                          {item.extras.map((extra) => (
                            <div
                              key={extra.id}
                              className="flex justify-between text-subheadline"
                            >
                              <span className="text-muted-foreground">
                                + {extra.quantity}x {extra.name_snapshot}
                              </span>
                              <span className="font-medium">
                                {formatCurrency(extra.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Costos adicionales */}
            {orderWithItems.delivery_fee > 0 && (
              <div className="flex justify-between text-subheadline">
                <span className="text-muted-foreground">Envío</span>
                <span className="font-medium">
                  {formatCurrency(orderWithItems.delivery_fee)}
                </span>
              </div>
            )}

            {orderWithItems.discount_amount > 0 && (
              <div className="flex justify-between text-subheadline text-green-600">
                <span>
                  Descuento
                  {orderWithItems.discount_type === "percentage" &&
                    ` (${orderWithItems.discount_value}%)`}
                </span>
                <span className="font-medium">
                  -{formatCurrency(orderWithItems.discount_amount)}
                </span>
              </div>
            )}

            {orderWithItems.commission_amount > 0 && (() => {
              // orderWithItems.source is the raw OrderSourceConfig.key
              // (a nanoid, see app/(dashboard)/precios/page.tsx's source
              // config editor) — resolve it to its human label here rather
              // than rendering the key itself. A source deleted from config
              // after the order was placed falls back to the raw key rather
              // than disappearing, since the order really was placed through
              // that (now-unnamed) channel.
              const sourceLabel = orderWithItems.source
                ? (getOrderSources().find((s) => s.key === orderWithItems.source)
                    ?.label ?? orderWithItems.source)
                : null;
              return (
                <div className="flex justify-between text-subheadline text-orange-600">
                  <span>
                    Comisión
                    {(sourceLabel || orderWithItems.commission_rate > 0) &&
                      ` (${[sourceLabel, orderWithItems.commission_rate > 0 ? `${orderWithItems.commission_rate}%` : null]
                        .filter(Boolean)
                        .join(" · ")})`}
                  </span>
                  <span className="font-medium">
                    -{formatCurrency(orderWithItems.commission_amount)}
                  </span>
                </div>
              );
            })()}

            {/* Cost/stock/finance porting, PR3: `!== 0` gated (not `> 0`
                like discount/commission above) — negative price_adjustment
                is a legitimate, displayable value here, own line, never
                folded into the discount line. */}
            {orderWithItems.price_adjustment !== 0 && (
              <div className="flex justify-between text-subheadline text-blue-600">
                <span>Ajuste de precio</span>
                <span className="font-medium">
                  {orderWithItems.price_adjustment > 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(orderWithItems.price_adjustment))}
                </span>
              </div>
            )}

            <Separator />

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-headline">Total</span>
              <span className="text-amount text-primary">
                {formatCurrency(orderWithItems.total_amount)}
              </span>
            </div>

            {/* Notas */}
            {orderWithItems.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="mb-2 font-semibold">Notas</h3>
                  <p className="text-subheadline text-muted-foreground">
                    {orderWithItems.notes}
                  </p>
                </div>
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}