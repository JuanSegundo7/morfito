import type { ProductSupplyWithSupply } from "@/lib/types";

/**
 * Cost/stock/finance porting, PR1. Pure functions only — no supabase/react
 * imports, deliberately, so this can be unit-tested in isolation and reused
 * from any consuming component via useMemo (see components/precios/
 * recipe-editor.tsx and app/(dashboard)/precios/page.tsx). This is also the
 * ONLY place cost/margin are computed — per the architectural invariant
 * documented in lib/hooks/supplies/use-product-supplies.ts, cost/margin are
 * NEVER their own cached query; they are always derived here, on demand,
 * from whatever `["supplies"]` / `["product-supplies-bulk", ...]` data is
 * currently in the react-query cache.
 */

export interface RecipeCostLine {
  supply_id: string;
  /** null when the supply row itself could not be found (e.g. bad join). */
  supplyName: string | null;
  quantity: number;
  /** quantity, scaled by variantFactors[scales_with_variant_group_id] when present. */
  effectiveQuantity: number;
  unitCost: number;
  lineCost: number;
  /** True when this recipe line's supply could not be resolved at all. */
  missing: boolean;
  /** True when the supply resolved but is no longer active. */
  inactive: boolean;
}

export interface ProductCostResult {
  total: number;
  lines: RecipeCostLine[];
  /**
   * True when at least one recipe line's supply is missing or inactive —
   * the UI must surface this rather than silently treating an
   * unresolvable/retired ingredient as a $0 contribution to cost (see
   * QA2.3 in this PR's task list). Missing/inactive lines are excluded
   * from `total` (their lineCost is 0), since there is no reliable cost to
   * add for them — `incomplete` is what signals "this total is not the
   * full picture," not a silently-wrong total.
   */
  incomplete: boolean;
}

export interface RecipeQuantityInput {
  quantity: number;
  scales_with_variant_group_id: string | null;
}

/**
 * Cost/stock/finance porting, PR2: the SINGLE resolution point for "recipe
 * line quantity, scaled by a selected variant option's quantity_factor when
 * the line opts in via `scales_with_variant_group_id`". `computeProductCost`
 * below calls this — and PR4's stock-deduction code (a later PR in this
 * stacked chain, out of scope here) MUST also call this same function
 * rather than re-deriving the `quantity * factor` multiplication itself, so
 * scaling behavior can never drift between cost math and stock deduction.
 *
 * `variantFactors` mirrors `computeProductCost`'s own optional map:
 * variant_group_id -> the quantity_factor of whichever option is
 * selected/frozen for that group. A line with no
 * `scales_with_variant_group_id`, or one whose group has no entry in
 * `variantFactors` (including when `variantFactors` itself is omitted),
 * resolves to its own quantity unscaled (factor of 1) — this is also the
 * "missing/legacy/no-selection resolves to factor 1, never 0" rule from
 * lib/types/index.ts's `VariantSelectionEntry.quantity_factor` doc comment,
 * satisfied here by construction (see also
 * lib/utils/variant-pricing.ts's resolveFrozenQuantityFactor, the
 * equivalent read-back guard for a single frozen entry).
 */
export function resolveRecipeQuantities<T extends RecipeQuantityInput>(
  recipe: T[],
  variantFactors?: Record<string, number>,
): number[] {
  return recipe.map((line) => {
    const factor =
      line.scales_with_variant_group_id && variantFactors
        ? (variantFactors[line.scales_with_variant_group_id] ?? 1)
        : 1;
    return line.quantity * factor;
  });
}

/**
 * Computes a product's total ingredient cost from its recipe lines.
 *
 * `variantFactors` is an optional map of variant_group_id -> the scaling
 * factor to apply (the selected VariantOption's quantity_factor — see
 * scripts/042-product-supplies.sql) for recipe lines that opted into
 * `scales_with_variant_group_id`. See `resolveRecipeQuantities` above for
 * the actual scaling resolution — this function no longer re-derives that
 * multiplication itself.
 */
export function computeProductCost(
  recipe: ProductSupplyWithSupply[],
  variantFactors?: Record<string, number>,
): ProductCostResult {
  let total = 0;
  let incomplete = false;

  const effectiveQuantities = resolveRecipeQuantities(recipe, variantFactors);

  const lines: RecipeCostLine[] = recipe.map((line, index) => {
    const supply = line.supply;
    const missing = !supply;
    const inactive = !missing && supply.is_active === false;

    if (missing || inactive) {
      incomplete = true;
    }

    const effectiveQuantity = effectiveQuantities[index];
    const unitCost = supply?.cost_per_unit ?? 0;
    // Unresolvable/inactive lines contribute 0 to the total rather than a
    // possibly-stale cost_per_unit — `incomplete` is what tells the caller
    // this total isn't trustworthy on its own, not a silent guess.
    const lineCost = missing || inactive ? 0 : effectiveQuantity * unitCost;

    total += lineCost;

    return {
      supply_id: line.supply_id,
      supplyName: supply?.name ?? null,
      quantity: line.quantity,
      effectiveQuantity,
      unitCost,
      lineCost,
      missing,
      inactive,
    };
  });

  return { total, lines, incomplete };
}

export interface MarginResult {
  profit: number;
  /** Null when basePrice is 0 — never divide by zero. */
  marginPct: number | null;
}

/** Computes profit and margin percentage for a product given its cost. */
export function computeMargin(basePrice: number, cost: number): MarginResult {
  const profit = basePrice - cost;
  const marginPct = basePrice === 0 ? null : (profit / basePrice) * 100;

  return { profit, marginPct };
}

// Floating-point division isn't exact (e.g. 0.3 / 0.1 evaluates to
// 2.9999999999999996, not 3) — this epsilon is added before flooring so a
// line that should exactly divide out doesn't get shorted by one unit.
const QUANTITY_EPSILON = 1e-9;

export interface MakeableCountResult {
  count: number | null;
  limitingSupplyId: string | null;
  /**
   * True when at least one recipe line's supply could not be resolved —
   * mirrors `ProductCostResult.incomplete`. Unlike cost, an unresolvable
   * line here is simply excluded from the MIN rather than counted as 0;
   * `incomplete` is what tells the caller this count may not reflect the
   * full recipe.
   */
  incomplete: boolean;
}

/**
 * How many units a single recipe line's on-hand stock can produce, given
 * that line's already-scaled (effective) quantity per unit. Returns null
 * when `effectiveQuantity` is not a usable divisor (<= 0) rather than a
 * misleading 0 — a malformed/misconfigured line should never look like "no
 * stock" or falsely win the MIN in `computeMakeableCount`.
 */
export function computeLineMakeable(
  stockQuantity: number,
  effectiveQuantity: number,
): number | null {
  if (effectiveQuantity <= 0) {
    return null;
  }

  // Negative stock_quantity is a deliberate, reachable state in this repo
  // (scripts/041-supplies-and-stock.sql has no non-negative constraint) —
  // it means "short by N", not an error. A negative makeable count is
  // meaningless to display, so clamp at 0 rather than rejecting it.
  return Math.max(0, Math.floor(stockQuantity / effectiveQuantity + QUANTITY_EPSILON));
}

/**
 * How many units of a product can currently be made from on-hand supply
 * stock — the MIN across recipe lines of `computeLineMakeable`, plus which
 * supply is the bottleneck. Reuses `resolveRecipeQuantities` (the same
 * function `computeProductCost` calls) rather than re-deriving
 * `quantity * factor` itself, so variant scaling can never drift between
 * cost math and makeable-count math.
 *
 * Deliberately diverges from `computeProductCost` on inactive supplies:
 * cost EXCLUDES inactive lines to avoid reporting a possibly-stale total,
 * but makeable-count INCLUDES them (using their current stock_quantity
 * as-is) — under-reporting how much you can make is the safe direction
 * here, silently ignoring a real ingredient is not.
 */
export function computeMakeableCount(
  recipe: ProductSupplyWithSupply[],
  variantFactors?: Record<string, number>,
): MakeableCountResult {
  let count: number | null = null;
  let limitingSupplyId: string | null = null;
  let incomplete = false;

  const effectiveQuantities = resolveRecipeQuantities(recipe, variantFactors);

  recipe.forEach((line, index) => {
    const supply = line.supply;

    if (!supply) {
      incomplete = true;
      return;
    }

    const lineMakeable = computeLineMakeable(
      supply.stock_quantity,
      effectiveQuantities[index],
    );

    if (lineMakeable === null) {
      return;
    }

    if (count === null || lineMakeable < count) {
      count = lineMakeable;
      limitingSupplyId = line.supply_id;
    }
  });

  return { count, limitingSupplyId, incomplete };
}
