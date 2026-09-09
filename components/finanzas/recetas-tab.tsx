"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useProducts } from "@/lib/hooks/use-products";
import { useAllSupplies } from "@/lib/hooks/supplies/use-supplies";
import { useProductSuppliesBulk } from "@/lib/hooks/supplies/use-product-supplies";
import {
  computeProductCost,
  computeMargin,
  computeMakeableCount,
} from "@/lib/services/recipe-cost";
import { RecipeEditor } from "@/components/finanzas/recipe-editor";
import { RecipeMarginChart, type RecipeMarginDatum } from "@/components/finanzas/recipe-margin-chart";
import { formatCurrency } from "@/lib/utils/format";
import type { ProductSupplyWithSupply, Supply } from "@/lib/types";

interface RecetaRow {
  cost: ReturnType<typeof computeProductCost>;
  makeable: ReturnType<typeof computeMakeableCount>;
}

/**
 * finanzas-gastos-recetas PR3: consolidated Recetas tab. Replaces the old
 * per-burger inline cost/margin badge + expand-to-edit block that used to
 * live in app/(dashboard)/precios/page.tsx with one row per product showing
 * cost/price/margin/makeable-count/limiting-supply simultaneously — no
 * per-row expansion required to SEE the numbers (expansion is only needed to
 * EDIT a recipe, via RecipeEditor).
 *
 * The cost/makeable-count derivation below is ported VERBATIM from that old
 * page (see git history on precios/page.tsx) — including two non-obvious
 * correctness guards documented inline. Dropping either one reintroduces a
 * real bug (see lib/services/recipe-cost.ts's architectural-invariant doc
 * comment and .atl/sdd/finanzas-gastos-recetas/design.md's Verification
 * Basis section):
 *   1. The `if (!allSupplies) return map;` cold-load guard.
 *   2. The `freshLines` supply override rebuilt from `["all-supplies"]`.
 */
export function RecetasTab() {
  const { data: burgers, isLoading: burgersLoading } = useProducts();
  const burgerIds = useMemo(() => (burgers ?? []).map((b) => b.id), [burgers]);
  const { data: allSupplies } = useAllSupplies();
  const { data: recipesByProduct } = useProductSuppliesBulk(burgerIds);

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const supplyById = useMemo(() => {
    const map: Record<string, Supply> = {};
    for (const supply of allSupplies ?? []) map[supply.id] = supply;
    return map;
  }, [allSupplies]);

  const rowsByProduct = useMemo(() => {
    const map: Record<string, RecetaRow> = {};
    // allSupplies resolves after recipesByProduct on a cold load in practice
    // (two independent queries racing) — without this guard, supplyById is
    // still {} while recipesByProduct has already arrived, so every recipe
    // line's supply is momentarily undefined and every product flashes
    // "Receta incompleta" even when its recipe is actually complete.
    if (!allSupplies) return map;

    for (const burger of burgers ?? []) {
      const rawLines = recipesByProduct?.[burger.id] ?? [];
      // Rebuild each line's `supply` from the freshest ["all-supplies"]
      // data instead of trusting the bulk query's embedded join, which can
      // go stale: editing a supply's cost_per_unit invalidates
      // ["supplies"]/["all-supplies"] but not ["product-supplies-bulk", ...]
      // (see use-product-supplies.ts). Without this override, editing a
      // supply's cost then revisiting Recetas would show a stale cost until
      // an unrelated refetch.
      const freshLines: ProductSupplyWithSupply[] = rawLines.map((line) => ({
        ...line,
        supply: supplyById[line.supply_id] as ProductSupplyWithSupply["supply"],
      }));

      map[burger.id] = {
        cost: computeProductCost(freshLines),
        makeable: computeMakeableCount(freshLines),
      };
    }

    return map;
  }, [burgers, recipesByProduct, supplyById]);

  const filteredBurgers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return burgers ?? [];
    return (burgers ?? []).filter((b) => b.name.toLowerCase().includes(term));
  }, [burgers, search]);

  // Same source of truth as the table below (computeMargin on the same
  // freshLines-derived cost) — never a separate calculation, per design.
  const chartData = useMemo<RecipeMarginDatum[]>(() => {
    return (burgers ?? []).flatMap((burger) => {
      const row = rowsByProduct[burger.id];
      if (!row || row.cost.lines.length === 0) return [];
      const margin = computeMargin(burger.base_price, row.cost.total);
      if (margin.marginPct === null) return [];
      return [{ name: burger.name, marginPct: Math.round(margin.marginPct) }];
    });
  }, [burgers, rowsByProduct]);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      <RecipeMarginChart data={chartData} isLoading={burgersLoading} />

      <Card className="bg-card">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Recetas</CardTitle>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {burgersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredBurgers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No hay productos que coincidan con la búsqueda
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Margen</TableHead>
                  <TableHead>Se pueden hacer</TableHead>
                  <TableHead>Insumo limitante</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBurgers.map((burger) => {
                  const row = rowsByProduct[burger.id];
                  const cost = row?.cost;
                  const makeable = row?.makeable;
                  const margin = cost
                    ? computeMargin(burger.base_price, cost.total)
                    : null;
                  // Deliberately independent of the incomplete-cost badge
                  // below: cost.incomplete and makeable.incomplete can
                  // disagree (e.g. an inactive supply makes cost incomplete
                  // while makeable-count still includes that line) — see
                  // design.md task 3.6.
                  const limitingSupply = makeable?.limitingSupplyId
                    ? supplyById[makeable.limitingSupplyId]
                    : null;
                  const isExpanded = expandedId === burger.id;

                  return (
                    <Fragment key={burger.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {burger.name}
                            {cost?.incomplete && (
                              <Badge
                                variant="secondary"
                                className="text-caption text-status-ready"
                                title="Receta incompleta: hay insumos faltantes o inactivos"
                              >
                                Receta incompleta
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{cost ? formatCurrency(cost.total) : "—"}</TableCell>
                        <TableCell>{formatCurrency(burger.base_price)}</TableCell>
                        <TableCell>
                          {margin?.marginPct !== null && margin?.marginPct !== undefined
                            ? `${margin.marginPct.toFixed(0)}%`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {makeable?.count !== null && makeable?.count !== undefined
                            ? makeable.count
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {limitingSupply?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            title={isExpanded ? "Ocultar receta" : "Editar receta"}
                            onClick={() => setExpandedId(isExpanded ? null : burger.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-secondary/20 p-0">
                            <RecipeEditor productId={burger.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
