"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { useProducts, useAddonProducts, useProductWithVariants } from "@/lib/hooks/use-products";
import { useUpdateProduct } from "@/lib/hooks/use-products-crud";
import { formatCurrency } from "@/lib/utils/format";
import type { ExtraCategory } from "@/lib/types";
import { useVertical } from "@/components/providers/vertical-provider";
import { useHasService } from "@/components/providers/services-provider";
import {
  getOrderSources,
  saveOrderSources,
  type OrderSourceConfig,
} from "@/lib/utils/commission";
import { Trash2, Plus } from "lucide-react";
import { nanoid } from "nanoid";

// Kept exactly as before the Phase 2 swap: this is precios/page.tsx's own
// tab-label map (note it also covers the "combos" tab, which isn't a real
// variant group — burgerVertical.labels.variantGroupLabels has no "combo"
// entry, so this local map is intentionally NOT replaced by it, unlike the
// /extras page. Pre-existing quirk, not touched here: this Record is missing
// a "sides" entry and has a "combo" entry not in the ExtraCategory type —
// harmless today only because the tabs below never look up "sides" and the
// "combos" tab never actually matches any row (extras.category is never
// "combo").
const categoryLabels: Record<ExtraCategory, string> = {
  extra: "Extras",
  drink: "Bebidas",
  fries: "Papas",
  // @ts-expect-error pre-existing: "combo" isn't part of ExtraCategory, kept
  // verbatim from before the Phase 2 migration — see comment above.
  combo: "Combos",
};

/** Low-effort, read-only preview of a burger's "Medallones"/"Papas" variant
 * groups (Phase 1 migration output) so an admin can see the per-patty /
 * per-portion price breakdown that today only exists implicitly via the
 * "Medallón" extra. Only fetches once expanded. */
function BurgerVariantsPreview({ productId }: { productId: string }) {
  const { data, isLoading } = useProductWithVariants(productId);

  if (isLoading) {
    return (
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Cargando variantes...
      </p>
    );
  }

  if (!data || data.variant_groups.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Esta hamburguesa no tiene grupos de variantes generados (requiere un
        extra &quot;Medallón&quot;/&quot;Papas fritas chicas&quot; para
        derivar el precio por unidad — ver scripts/010-generic-products.sql).
      </p>
    );
  }

  return (
    <div className="space-y-3 px-3 pb-3">
      {data.variant_groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.variant_options.map((option) => (
              <Badge
                key={option.id}
                variant={option.is_default ? "default" : "outline"}
                className="text-xs bg-card"
              >
                {option.label}
                {option.price_delta !== 0 &&
                  ` (${option.price_delta > 0 ? "+" : ""}${formatCurrency(option.price_delta)})`}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const vertical = useVertical();
  // Gateado por plan: el editor de canales/comisiones no tiene sentido si
  // el proyecto no contrato order_source_commission (ver
  // services-provider.tsx) -- ocultarlo tambien acá, no solo en el wizard/
  // rendimiento, evita que un admin configure canales para una feature que
  // no tiene.
  const hasOrderSourceService = useHasService("order_source_commission");
  const { data: burgers, isLoading: burgersLoading } = useProducts();
  const { data: extras, isLoading: extrasLoading } = useAddonProducts();
  const updateBurger = useUpdateProduct();
  const updateExtra = useUpdateProduct();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [expandedBurgerId, setExpandedBurgerId] = useState<string | null>(
    null,
  );

  // Cost/stock/finance porting, PR2: order sources + their commission rates
  // — operator-configured localStorage data (see lib/utils/commission.ts).
  // Untouched by the settings port from jebbs-dashboard (out of scope, see
  // decision 5): morfito's own per-channel commission model stays exactly
  // as it is, in localStorage — only the default delivery fee above moved
  // to app_settings.
  const [orderSources, setOrderSources] = useState<OrderSourceConfig[]>([]);
  const [newSourceLabel, setNewSourceLabel] = useState("");
  const [newSourceRate, setNewSourceRate] = useState("");
  const [editingSourceKey, setEditingSourceKey] = useState<string | null>(null);
  const [editSourceLabel, setEditSourceLabel] = useState("");
  const [editSourceRate, setEditSourceRate] = useState("");

  useEffect(() => {
    setOrderSources(getOrderSources());
  }, []);

  const persistOrderSources = (next: OrderSourceConfig[]) => {
    saveOrderSources(next);
    setOrderSources(next);
  };

  const handleAddSource = () => {
    if (!newSourceLabel.trim()) return;
    const rate = Math.max(0, Number(newSourceRate) || 0);
    persistOrderSources([
      ...orderSources,
      { key: nanoid(), label: newSourceLabel.trim(), commissionRate: rate },
    ]);
    setNewSourceLabel("");
    setNewSourceRate("");
  };

  const handleStartEditSource = (s: OrderSourceConfig) => {
    setEditingSourceKey(s.key);
    setEditSourceLabel(s.label);
    setEditSourceRate(s.commissionRate.toString());
  };

  const handleSaveSource = () => {
    if (!editingSourceKey) return;
    persistOrderSources(
      orderSources.map((s) =>
        s.key === editingSourceKey
          ? {
              ...s,
              label: editSourceLabel.trim() || s.label,
              commissionRate: Math.max(0, Number(editSourceRate) || 0),
            }
          : s,
      ),
    );
    setEditingSourceKey(null);
  };

  const handleDeleteSource = (key: string) => {
    persistOrderSources(orderSources.filter((s) => s.key !== key));
  };

  const handleStartEdit = (id: string, currentPrice: number) => {
    setEditingId(id);
    setEditPrice(currentPrice.toString());
  };

  const handleSaveBurgerPrice = async (id: string) => {
    await updateBurger.mutateAsync({
      id,
      base_price: Number.parseFloat(editPrice),
    });
    setEditingId(null);
    setEditPrice("");
  };

  const handleSaveExtraPrice = async (id: string) => {
    await updateExtra.mutateAsync({
      id,
      base_price: Number.parseFloat(editPrice),
    });
    setEditingId(null);
    setEditPrice("");
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const isLoading = burgersLoading || extrasLoading;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header
        title={vertical.labels.pages.precios.title}
        subtitle={vertical.labels.pages.precios.subtitle}
      />

      <div className="flex-1 overflow-auto py-6 space-y-6">
        {/* Settings port from jebbs-dashboard: el costo de delivery por
            defecto se mudó a /configuracion (app_settings singleton, ver
            scripts/048-app-settings.sql) — ya no vive en localStorage ni se
            edita en esta página. */}
        <p className="text-caption text-muted-foreground px-1">
          El costo de envío por defecto ahora se configura en{" "}
          <Link href="/configuracion" className="underline hover:text-foreground">
            Configuración
          </Link>
          .
        </p>

        {/* Cost/stock/finance porting, PR2: order sources (sales channels) +
            their commission rates */}
        {/* NOTA: este bloque no paso por la migracion tipografica de
            jebbs-dashboard@42eecdb -- la logica de negocio (multi-canal,
            editable) diverge demasiado de lo que jebbs tenia en ese punto
            (un solo canal hardcodeado) como para mezclar con seguridad.
            Migrar text-xs -> text-caption aca en una pasada dedicada aparte.
            Gateado por plan: ver hasOrderSourceService arriba. */}
        {hasOrderSourceService && (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Canales de venta y comisiones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orderSources.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay canales configurados todavía.
              </p>
            )}

            {orderSources.map((s) => (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-lg bg-secondary/30 p-3"
              >
                {editingSourceKey === s.key ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editSourceLabel}
                      onChange={(e) => setEditSourceLabel(e.target.value)}
                      className="w-40"
                      autoFocus
                    />
                    <Input
                      type="number"
                      min={0}
                      value={editSourceRate}
                      onChange={(e) => setEditSourceRate(e.target.value)}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">% comisión</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      onClick={handleSaveSource}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditingSourceKey(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.commissionRate}% de comisión sobre el subtotal de items
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        className="text-primary"
                        onClick={() => handleStartEditSource(s)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteSource(s.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                placeholder="Nombre del canal (ej: PedidosYa)"
                value={newSourceLabel}
                onChange={(e) => setNewSourceLabel(e.target.value)}
                className="w-48"
              />
              <Input
                type="number"
                min={0}
                placeholder="% comisión"
                value={newSourceRate}
                onChange={(e) => setNewSourceRate(e.target.value)}
                className="w-28"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddSource}
                disabled={!newSourceLabel.trim()}
              >
                <Plus className="mr-1 h-4 w-4" />
                Agregar canal
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        <Tabs defaultValue="burgers">
          <TabsList className="mb-6">
            <TabsTrigger value="burgers">Hamburguesas</TabsTrigger>
            <TabsTrigger value="extras">Extras</TabsTrigger>
            <TabsTrigger value="drinks">Bebidas</TabsTrigger>
            <TabsTrigger value="fries">Papas</TabsTrigger>
            <TabsTrigger value="combos">Combos</TabsTrigger>
          </TabsList>

          <TabsContent value="burgers">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Precios de Hamburguesas</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {burgers?.map((burger) => (
                      <div
                        key={burger.id}
                        className="rounded-lg bg-secondary/30"
                      >
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{burger.name}</span>
                            {!burger.is_available && (
                              <Badge variant="secondary" className="text-caption">
                                No disponible
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {editingId === burger.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) =>
                                    setEditPrice(e.target.value)
                                  }
                                  className="w-28"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-primary"
                                  onClick={() =>
                                    handleSaveBurgerPrice(burger.id)
                                  }
                                  disabled={updateBurger.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={handleCancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                className="font-bold text-primary"
                                onClick={() =>
                                  handleStartEdit(burger.id, burger.base_price)
                                }
                              >
                                {formatCurrency(burger.base_price)}
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground"
                              title={
                                expandedBurgerId === burger.id
                                  ? "Ocultar variantes"
                                  : "Ver variantes (Medallones/Papas)"
                              }
                              onClick={() =>
                                setExpandedBurgerId(
                                  expandedBurgerId === burger.id
                                    ? null
                                    : burger.id,
                                )
                              }
                            >
                              {expandedBurgerId === burger.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {expandedBurgerId === burger.id && (
                          <BurgerVariantsPreview productId={burger.id} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {(["extras", "drinks", "fries", "combos"] as const).map((tab) => {
            const categoryMap: Record<string, ExtraCategory> = {
              extras: "extra",
              drinks: "drink",
              fries: "fries",
              combos: "combo",
            };
            const category = categoryMap[tab];
            const filteredExtras =
              extras?.filter((e) => e.category === category) || [];

            return (
              <TabsContent key={tab} value={tab}>
                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle>Precios de {categoryLabels[category]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : filteredExtras.length > 0 ? (
                      <div className="space-y-2">
                        {filteredExtras.map((extra) => (
                          <div
                            key={extra.id}
                            className="flex items-center justify-between rounded-lg bg-secondary/30 p-3 bg0"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{extra.name}</span>
                              {!extra.is_available && (
                                <Badge variant="secondary" className="text-caption">
                                  No disponible
                                </Badge>
                              )}
                            </div>

                            {editingId === extra.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  className="w-28"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-status-ready"
                                  onClick={() => handleSaveExtraPrice(extra.id)}
                                  disabled={updateExtra.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={handleCancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                className="font-bold text-primary"
                                onClick={() =>
                                  handleStartEdit(extra.id, extra.base_price)
                                }
                              >
                                {formatCurrency(extra.base_price)}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-muted-foreground">
                        No hay items en esta categoría
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
