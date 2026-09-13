-- ============================================================
-- Dishflow — Cost/Stock/Finance porting, PR1: recipes + variant scaling
-- factor (042)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Second migration of PR1 (see scripts/041-supplies-and-stock.sql for the
-- first). Two independent, additive pieces, kept in one file because
-- they're both prerequisites for the SAME feature (per-product recipe
-- cost, lib/services/recipe-cost.ts) and both needed by the same PR's UI
-- (components/finanzas/recipe-editor.tsx):
--
--   1. `product_supplies` — the recipe join table: which supplies (and how
--      much of each) a product consumes. One row per product+supply line.
--   2. `variant_options.quantity_factor` — an additive column on the
--      EXISTING variant_options table (scripts/010-generic-products.sql),
--      backfilled below so a recipe line that opts into
--      `scales_with_variant_group_id` can scale its supply consumption by
--      whichever variant option was selected (e.g. a "Doble" burger should
--      consume ~2x the meat supply of a "Simple" one). The scaling
--      MULTIPLICATION itself (recipe_line.quantity * quantity_factor) is
--      NOT implemented in this PR — lib/services/recipe-cost.ts's
--      computeProductCost accepts an optional variantFactors map for a
--      later phase to wire up; this migration only makes the per-option
--      factor exist and be correctly backfilled so that later phase has
--      real data to read, not a column of TODOs.
--
-- WHY quantity_factor IS NOT NULL (not just CHECK(quantity_factor > 0))
-- -------------------------------------------------------------------------
-- CHECK(quantity_factor > 0) alone would still PASS for a NULL value —
-- Postgres CHECK constraints only reject rows where the expression
-- evaluates to FALSE; NULL evaluates to UNKNOWN, which is treated as
-- passing. Without NOT NULL, every pre-existing variant_options row (and
-- any future INSERT that omits this column) would silently carry a NULL
-- quantity_factor, defeating the whole point of the constraint. NOT NULL
-- (with DEFAULT 1) closes that gap: 1 means "no scaling" (same amount
-- regardless of which option was picked), which is the correct default for
-- every option group that a recipe line does NOT opt into scaling by.
--
-- BACKFILL FORMULA AND THE sort_order = 0 EDGE CASE
-- -------------------------------------------------------------------------
-- Per variant_group, quantity_factor(option) = option.sort_order /
-- default_option.sort_order — e.g. for the "Medallones" group
-- (scripts/010-generic-products.sql §2a: Simple=1, Doble=2, Triple=3,
-- default usually 2), Doble's factor is 2/2=1 (baseline), Triple's is
-- 3/2=1.5, Simple's is 1/2=0.5. This lets a later phase multiply a recipe
-- line's base `quantity` by whichever option's factor is selected.
--
-- BLOCKING ISSUE IDENTIFIED, HANDLED BELOW (flagging per this refactor's
-- own convention rather than silently producing a migration that fails
-- partway through): the "Papas" group (§2b) generates an option with
-- sort_order = 0 ("Sin papas"), and for any burger whose
-- default_fries_quantity is itself 0, that IS the default option — the
-- division above would compute 0/0. Even for burgers whose default is NOT
-- 0, the non-default "Sin papas" option (sort_order 0) would compute
-- 0/default = 0, which VIOLATES the CHECK(quantity_factor > 0) constraint
-- just added, since dividing by a positive default_sort_order still yields
-- exactly 0 for a sort_order-0 option. The backfill below explicitly skips
-- any option whose OWN sort_order is 0, and skips an entire group when its
-- default option's sort_order is 0 (self-division), leaving those options
-- at the column default of 1 rather than attempting a value the CHECK
-- constraint would reject. This means "0 units of X" options do not get a
-- true zero scaling factor in this phase — a real gap, but a documented one
-- for the later phase that actually wires quantity_factor into cost
-- calculation to address (e.g. by special-casing sort_order = 0 in
-- application code rather than in this column).
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first. Column/table shapes used below
-- (variant_groups.sort_order, variant_options.is_default/sort_order) were
-- confirmed by reading scripts/010-generic-products.sql, not guessed.
--
-- REVERSIBILITY
-- --------------
-- Additive only. To roll back:
--   DROP TABLE product_supplies;
--   ALTER TABLE variant_options DROP COLUMN quantity_factor;
--
-- ============================================================

-- ============================================================
-- 1. product_supplies (recipe lines)
-- ============================================================

CREATE TABLE product_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- RESTRICT (not CASCADE): deleting a supply that's still referenced by a
  -- recipe line must fail loudly rather than silently deleting that recipe
  -- line's data. Deactivating a supply (supplies.is_active = false) is the
  -- supported way to retire it without breaking existing recipes — see
  -- lib/services/recipe-cost.ts's `incomplete` flag, which is exactly what
  -- surfaces an inactive/missing supply on a recipe to the UI instead of
  -- silently mis-costing it.
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  -- Optional: when set, this recipe line's effective quantity scales with
  -- whichever option is selected in that variant group at order time (see
  -- variant_options.quantity_factor below). ON DELETE SET NULL — if the
  -- referenced variant group is deleted, the recipe line survives as a
  -- flat (non-scaling) line rather than being deleted itself.
  scales_with_variant_group_id UUID REFERENCES variant_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One line per product+supply — editing an existing ingredient's quantity
  -- is an UPDATE, not a second INSERT. Matches the shape recipe-editor.tsx
  -- expects (one row per supply per product).
  UNIQUE(product_id, supply_id)
);

CREATE INDEX idx_product_supplies_product_id ON product_supplies(product_id);

ALTER TABLE product_supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on product_supplies" ON product_supplies FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. variant_options.quantity_factor (additive column + backfill)
-- ============================================================

ALTER TABLE variant_options
  ADD COLUMN quantity_factor NUMERIC NOT NULL DEFAULT 1 CHECK (quantity_factor > 0);

-- Backfill: for every variant_group that has a default option, express
-- every option's quantity_factor as sort_order / default_option.sort_order.
-- See "BACKFILL FORMULA AND THE sort_order = 0 EDGE CASE" above for why
-- sort_order = 0 cases are explicitly skipped (left at the column default
-- of 1) instead of attempting a value that would violate the CHECK
-- constraint just added.
DO $$
DECLARE
  grp RECORD;
  default_sort_order INTEGER;
BEGIN
  FOR grp IN SELECT id FROM variant_groups LOOP
    -- Resets to NULL when no default option exists for this group (plain,
    -- non-STRICT SELECT INTO on zero rows assigns NULL) — handled by the
    -- IS NULL branch below.
    SELECT sort_order INTO default_sort_order
    FROM variant_options
    WHERE variant_group_id = grp.id AND is_default = TRUE
    LIMIT 1;

    IF default_sort_order IS NULL OR default_sort_order = 0 THEN
      -- No default option for this group, or the default option's own
      -- sort_order is 0 (self-division) — skip entirely, every option in
      -- this group keeps quantity_factor = 1 (the column default).
      CONTINUE;
    END IF;

    UPDATE variant_options
    SET quantity_factor = sort_order::NUMERIC / default_sort_order
    WHERE variant_group_id = grp.id
      -- sort_order = 0 (e.g. "Sin papas") would compute quantity_factor =
      -- 0, which violates CHECK(quantity_factor > 0) — leave it at the
      -- column default of 1 instead of failing the whole migration.
      AND sort_order > 0;
  END LOOP;
END $$;
