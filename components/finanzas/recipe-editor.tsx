"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useSupplies } from "@/lib/hooks/supplies/use-supplies";
import {
  useProductSupplies,
  useCreateProductSupply,
  useUpdateProductSupply,
  useDeleteProductSupply,
} from "@/lib/hooks/supplies/use-product-supplies";
import { useProductWithVariants } from "@/lib/hooks/use-products";
import { formatCurrency } from "@/lib/utils/format";

interface RecipeEditorProps {
  productId: string;
}

const NO_VARIANT_GROUP = "__none__";

/**
 * Given a group's DEFAULT option (is_default: true), returns its
 * quantity_factor — falls back to 1 (no-op conversion) when the group has
 * no flagged default or that default's factor isn't a usable positive
 * number, exactly like the DB backfill's own sort_order = 0 edge case
 * (scripts/042-product-supplies.sql) falls back to the column default of 1.
 */
function defaultOptionFactor(
  group: { variant_options: { is_default: boolean; quantity_factor: number }[] } | undefined,
): number {
  const defaultOption = group?.variant_options.find((o) => o.is_default);
  return defaultOption && defaultOption.quantity_factor > 0
    ? defaultOption.quantity_factor
    : 1;
}

/** Trims a computed suggestion to a sane number of decimals for display/prefill. */
function roundQuantity(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Per-product recipe line editor: add/remove/edit supply+quantity rows for
 * one product's `product_supplies` recipe.
 *
 * IMPORTANT (grounded gotcha, see this PR's task list): the quantity input
 * below always reads/writes the recipe line's BASE (unscaled) `quantity` —
 * NEVER the effective/scaled value. A sibling project shipped a bug where
 * an operator would view the effective (scaled) number, save it back
 * unchanged, and have it silently re-multiplied by the scaling factor on
 * every save. This editor never computes or displays an effective quantity
 * at all — only the base value round-trips through the input/buffer/save
 * path. The fixed<->scaled toggle below only ever offers a SUGGESTED
 * conversion value; the operator must explicitly click "Usar sugerencia"
 * to apply it to the (still-unsaved) buffer, and a further explicit
 * "Guardar" click to persist it — never auto-applied, never auto-saved.
 */
export function RecipeEditor({ productId }: RecipeEditorProps) {
  const { data: recipe, isLoading: recipeLoading } = useProductSupplies(productId);
  const { data: supplies, isLoading: suppliesLoading } = useSupplies();
  const { data: productWithVariants } = useProductWithVariants(productId);

  const createLine = useCreateProductSupply();
  const updateLine = useUpdateProductSupply();
  const deleteLine = useDeleteProductSupply();

  const [newSupplyId, setNewSupplyId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newVariantGroupId, setNewVariantGroupId] = useState(NO_VARIANT_GROUP);

  // Local edit buffers keyed by recipe line id — only lines the user has
  // touched get an entry here, so untouched lines always reflect the
  // server value straight from `recipe`.
  const [editBuffers, setEditBuffers] = useState<
    Record<string, { quantity: string; variantGroupId: string }>
  >({});

  const variantGroups = productWithVariants?.variant_groups ?? [];

  const usedSupplyIds = useMemo(
    () => new Set((recipe ?? []).map((line) => line.supply_id)),
    [recipe],
  );
  const availableSupplies = useMemo(
    () => (supplies ?? []).filter((s) => !usedSupplyIds.has(s.id)),
    [supplies, usedSupplyIds],
  );

  const handleAdd = async () => {
    if (!newSupplyId || !newQuantity) return;

    try {
      await createLine.mutateAsync({
        product_id: productId,
        supply_id: newSupplyId,
        quantity: Number(newQuantity),
        scales_with_variant_group_id:
          newVariantGroupId === NO_VARIANT_GROUP ? null : newVariantGroupId,
      });
      setNewSupplyId("");
      setNewQuantity("");
      setNewVariantGroupId(NO_VARIANT_GROUP);
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  const handleSaveLine = async (lineId: string) => {
    const buffer = editBuffers[lineId];
    if (!buffer) return;

    try {
      await updateLine.mutateAsync({
        id: lineId,
        productId,
        quantity: Number(buffer.quantity),
        scales_with_variant_group_id:
          buffer.variantGroupId === NO_VARIANT_GROUP ? null : buffer.variantGroupId,
      });
      setEditBuffers((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  const handleRemove = async (lineId: string) => {
    try {
      await deleteLine.mutateAsync({ id: lineId, productId });
    } catch {
      /* alert already shown by the mutation's onError */
    }
  };

  if (recipeLoading || suppliesLoading) {
    return (
      <div className="space-y-2 px-3 pb-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 pb-3">
      {(recipe ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">
          Este producto todavía no tiene receta cargada.
        </p>
      )}

      {(recipe ?? []).map((line) => {
        const buffer = editBuffers[line.id] ?? {
          quantity: line.quantity.toString(),
          variantGroupId: line.scales_with_variant_group_id ?? NO_VARIANT_GROUP,
        };
        const isDirty = !!editBuffers[line.id];
        const isMissing = !line.supply;
        const isInactive = !!line.supply && !line.supply.is_active;

        // Fixed<->scaled toggle state — encoded purely via
        // buffer.variantGroupId (NO_VARIANT_GROUP = fixed, a real group id =
        // scaled), same value the Select below already reads/writes. The
        // toggle buttons are just a faster way to flip that same value.
        const originalIsScaled = !!line.scales_with_variant_group_id;
        const currentIsScaled = buffer.variantGroupId !== NO_VARIANT_GROUP;
        const toggledSinceLoad = currentIsScaled !== originalIsScaled;

        // "the relevant factor" — whichever group the conversion should be
        // read against: the newly-selected group when going fixed->scaled,
        // or the line's original (still-saved) group when going
        // scaled->fixed.
        const relevantGroupId = currentIsScaled
          ? buffer.variantGroupId
          : line.scales_with_variant_group_id;
        const relevantGroup = variantGroups.find((g) => g.id === relevantGroupId);
        const conversionFactor = defaultOptionFactor(relevantGroup);

        // "the other form's quantity" — the currently-SAVED base quantity
        // (never the in-progress buffer edit, so re-toggling repeatedly
        // doesn't compound the conversion), converted into what the base
        // quantity would need to be in the OTHER mode to preserve the same
        // effective consumption at the group's default option.
        const suggestedQuantity = toggledSinceLoad
          ? roundQuantity(
              currentIsScaled
                ? line.quantity / conversionFactor // fixed -> scaled
                : line.quantity * conversionFactor, // scaled -> fixed
            )
          : null;

        return (
          <div key={line.id} className="flex flex-col gap-1.5 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-sm font-medium">
                {line.supply?.name ?? "Insumo eliminado"}
                {(isMissing || isInactive) && (
                  <span className="ml-1 text-xs text-status-ready">
                    ({isMissing ? "faltante" : "inactivo"})
                  </span>
                )}
              </span>

              <Input
                type="number"
                className="w-24"
                value={buffer.quantity}
                onChange={(e) =>
                  setEditBuffers((prev) => ({
                    ...prev,
                    [line.id]: { ...buffer, quantity: e.target.value },
                  }))
                }
              />

              <span className="text-xs text-muted-foreground shrink-0">
                {line.supply?.unit ?? ""}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={currentIsScaled ? "outline" : "secondary"}
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setEditBuffers((prev) => ({
                      ...prev,
                      [line.id]: { ...buffer, variantGroupId: NO_VARIANT_GROUP },
                    }))
                  }
                >
                  Fijo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={currentIsScaled ? "secondary" : "outline"}
                  className="h-7 px-2 text-xs"
                  disabled={variantGroups.length === 0}
                  onClick={() =>
                    setEditBuffers((prev) => ({
                      ...prev,
                      [line.id]: {
                        ...buffer,
                        variantGroupId:
                          buffer.variantGroupId !== NO_VARIANT_GROUP
                            ? buffer.variantGroupId
                            : (line.scales_with_variant_group_id ?? variantGroups[0]?.id ?? NO_VARIANT_GROUP),
                      },
                    }))
                  }
                >
                  Escala con variante
                </Button>
              </div>

              {currentIsScaled && (
                <Select
                  value={buffer.variantGroupId}
                  onValueChange={(v) =>
                    setEditBuffers((prev) => ({ ...prev, [line.id]: { ...buffer, variantGroupId: v } }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sin escalado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VARIANT_GROUP}>Sin escalado</SelectItem>
                    {variantGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {isDirty && (
                <Button size="sm" onClick={() => handleSaveLine(line.id)} disabled={updateLine.isPending}>
                  Guardar
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => handleRemove(line.id)}
                disabled={deleteLine.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {suggestedQuantity !== null && (
              <div className="flex items-center gap-2 rounded-md bg-secondary/30 px-2 py-1 text-xs text-muted-foreground">
                <span>
                  Sugerencia al cambiar a {currentIsScaled ? "escalado" : "fijo"}
                  {relevantGroup ? ` (${relevantGroup.label})` : ""}: {suggestedQuantity}
                  {line.supply?.unit ? ` ${line.supply.unit}` : ""}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    setEditBuffers((prev) => ({
                      ...prev,
                      [line.id]: { ...buffer, quantity: suggestedQuantity.toString() },
                    }))
                  }
                >
                  Usar sugerencia
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t">
        <Select value={newSupplyId} onValueChange={setNewSupplyId}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Insumo" />
          </SelectTrigger>
          <SelectContent>
            {availableSupplies.map((supply) => (
              <SelectItem key={supply.id} value={supply.id}>
                {supply.name} ({formatCurrency(supply.cost_per_unit)}/{supply.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          className="w-24"
          placeholder="Cant."
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
        />

        <Select value={newVariantGroupId} onValueChange={setNewVariantGroupId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sin escalado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VARIANT_GROUP}>Sin escalado</SelectItem>
            {variantGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!newSupplyId || !newQuantity || createLine.isPending}
        >
          <Plus className="mr-1 h-4 w-4" />
          Agregar
        </Button>
      </div>
    </div>
  );
}
