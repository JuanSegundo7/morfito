import { describe, expect, it } from "vitest";
import {
  computeLineMakeable,
  computeMakeableCount,
  computeProductCost,
} from "@/lib/services/recipe-cost";
import type { ProductSupplyWithSupply, Supply } from "@/lib/types";

/**
 * `computeMakeableCount` / `computeLineMakeable` — how many units of a
 * product can currently be made from on-hand supply stock, and which supply
 * is the bottleneck. Deliberately a separate function from
 * `computeProductCost` (see that function's own tests/comments) because the
 * two intentionally disagree on how to treat inactive/unresolvable lines:
 * cost EXCLUDES them to avoid reporting a wrong $ total, makeable-count
 * INCLUDES active-or-not stock because under-reporting how much you can make
 * is the safe direction, not silently ignoring a real ingredient.
 */

function makeSupply(overrides: Partial<Supply> = {}): Supply {
  return {
    id: "supply-1",
    name: "Test Supply",
    unit: "unit",
    cost_per_unit: 1,
    stock_quantity: 10,
    min_stock_quantity: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeLine(
  overrides: Partial<ProductSupplyWithSupply> = {},
): ProductSupplyWithSupply {
  return {
    id: "line-1",
    product_id: "product-1",
    supply_id: "supply-1",
    quantity: 1,
    scales_with_variant_group_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    supply: makeSupply(),
    ...overrides,
  };
}

describe("computeMakeableCount", () => {
  it("2.3: takes the MIN across lines and reports the limiting supply", () => {
    const supplyA = makeSupply({ id: "supply-a", stock_quantity: 10 });
    const supplyB = makeSupply({ id: "supply-b", stock_quantity: 9 });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 2,
      supply: supplyA,
    }); // floor(10/2) = 5
    const lineB = makeLine({
      supply_id: supplyB.id,
      quantity: 3,
      supply: supplyB,
    }); // floor(9/3) = 3

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(3);
    expect(result.limitingSupplyId).toBe(supplyB.id);
  });

  it("2.4: excludes a quantity <= 0 line from the MIN instead of treating it as 0", () => {
    const supplyA = makeSupply({ id: "supply-a", stock_quantity: 10 });
    const supplyB = makeSupply({ id: "supply-b", stock_quantity: 5 });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 2,
      supply: supplyA,
    }); // floor(10/2) = 5
    const lineB = makeLine({
      supply_id: supplyB.id,
      quantity: 0, // malformed/misconfigured — must not win the MIN as 0
      supply: supplyB,
    });

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(5);
  });

  it("2.5: excludes a negative-effective-quantity line the same way as quantity === 0", () => {
    const supplyA = makeSupply({ id: "supply-a", stock_quantity: 10 });
    const supplyB = makeSupply({ id: "supply-b", stock_quantity: 5 });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 2,
      supply: supplyA,
    }); // floor(10/2) = 5
    const lineB = makeLine({
      supply_id: supplyB.id,
      quantity: -1, // defensive: should not occur, must not crash/win
      supply: supplyB,
    });

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(5);
  });

  it("2.6: returns count null (not 0) when every line has quantity <= 0", () => {
    const lineA = makeLine({ quantity: 0 });
    const lineB = makeLine({ supply_id: "supply-b", quantity: -1 });

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBeNull();
    expect(result.limitingSupplyId).toBeNull();
  });

  it("2.7: an inactive supply line still participates in, and can win, the MIN", () => {
    const supplyA = makeSupply({
      id: "supply-a",
      stock_quantity: 100,
      is_active: true,
    });
    const supplyB = makeSupply({
      id: "supply-b",
      stock_quantity: 2,
      is_active: false,
    });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 1,
      supply: supplyA,
    }); // floor(100/1) = 100
    const lineB = makeLine({
      supply_id: supplyB.id,
      quantity: 1,
      supply: supplyB,
    }); // floor(2/1) = 2, inactive but still wins

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(2);
    expect(result.limitingSupplyId).toBe(supplyB.id);
  });

  it("2.8: computeLineMakeable applies an epsilon guard against float imprecision", () => {
    // 0.3 / 0.1 naturally evaluates to 2.9999999999999996 in IEEE754, which
    // would floor to 2 without a guard — the true answer is 3.
    expect(computeLineMakeable(0.3, 0.1)).toBe(3);
  });

  it("2.9: excludes a line whose supply cannot be resolved, instead of treating it as 0", () => {
    const supplyA = makeSupply({ id: "supply-a", stock_quantity: 10 });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 2,
      supply: supplyA,
    }); // floor(10/2) = 5
    const lineB = makeLine({
      supply_id: "supply-missing",
      quantity: 1,
      supply: undefined as unknown as Supply,
    });

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(5);
    expect(result.incomplete).toBe(true);
  });

  it("clamps a negative stock_quantity's makeable count at 0 instead of returning negative", () => {
    // Negative stock is a deliberate, reachable state in this repo (e.g. an
    // order deducted more than was on hand) — "how many can I make" must
    // never read as a negative number.
    expect(computeLineMakeable(-5, 2)).toBe(0);

    const supplyA = makeSupply({ id: "supply-a", stock_quantity: 10 });
    const supplyB = makeSupply({ id: "supply-b", stock_quantity: -5 });
    const lineA = makeLine({
      supply_id: supplyA.id,
      quantity: 2,
      supply: supplyA,
    }); // floor(10/2) = 5
    const lineB = makeLine({
      supply_id: supplyB.id,
      quantity: 1,
      supply: supplyB,
    }); // negative stock, clamped to 0 — must win the MIN as 0, not -5

    const result = computeMakeableCount([lineA, lineB]);

    expect(result.count).toBe(0);
    expect(result.limitingSupplyId).toBe(supplyB.id);
  });

  it("2.10: derives the same effective quantity for a variant-scaled line as computeProductCost", () => {
    const supply = makeSupply({
      id: "supply-a",
      stock_quantity: 100,
      cost_per_unit: 5,
    });
    const line = makeLine({
      supply_id: supply.id,
      quantity: 2,
      scales_with_variant_group_id: "group-1",
      supply,
    });
    const variantFactors = { "group-1": 3 };

    const costResult = computeProductCost([line], variantFactors);
    const makeableResult = computeMakeableCount([line], variantFactors);

    // Sanity check on the fixture itself: 2 * 3 = 6.
    const effectiveQuantity = costResult.lines[0].effectiveQuantity;
    expect(effectiveQuantity).toBe(6);

    // The regression this guards against: computeMakeableCount re-deriving
    // `quantity * factor` independently instead of reusing
    // resolveRecipeQuantities, which could silently drift from cost's math.
    expect(makeableResult.count).toBe(
      computeLineMakeable(supply.stock_quantity, effectiveQuantity),
    );
  });
});
