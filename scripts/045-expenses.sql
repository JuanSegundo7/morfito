-- ============================================================
-- Morfito — /finanzas consolidation, PR4: expenses (045)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- First migration of the /finanzas consolidation chain (see
-- scripts/044-order-stock-movements.sql for the previous chain's last one).
-- Introduces `expenses` — one-off operating expenses (supplies purchases,
-- services, salaries, rent, other), read/written by
-- lib/hooks/expenses/use-expenses.ts and surfaced by the Gastos tab of
-- app/(dashboard)/finanzas.
--
-- Shape deliberately mirrors `external_income`
-- (scripts/000-baseline-schema.sql:306-312) — the closest existing sibling:
-- a DATE-keyed, manually-logged money table with a create+delete-only hook
-- surface (lib/hooks/orders/use-external-income.ts). date/amount/description
-- are byte-for-byte the same declarations, so the two tables aggregate
-- identically in useOrdersAnalytics.
--
-- WHY RECURRING EXPENSES ARE NOT MODELLED HERE
-- -------------------------------------------------------------------------
-- Confirmed product decision: one-off only. No `recurrence`/`parent_id`/
-- `next_due_date` columns are added "just in case" — a recurring-expense
-- feature needs a materialisation strategy (generate rows ahead? derive on
-- read?) that would dictate the column shape, and guessing it now would
-- almost certainly guess wrong. Adding those columns later is additive.
--
-- WHY category IS A CHECK ENUM BUT orders.source IS NOT
-- -------------------------------------------------------------------------
-- Deliberate inversion of scripts/043-order-source-and-commission.sql:11-19's
-- reasoning, and the inversion is the point. Sales channels are
-- operator-configured data that changes at will (hence no CHECK there).
-- Expense categories are a FIXED, code-branched set of exactly five values
-- that the Resumen tab groups and colours by — the same posture as
-- orders.status / supplies.unit (scripts/041-supplies-and-stock.sql:67).
-- Confirmed product decision: no extension.
--
-- WHY THE supply_id/quantity PAIRING IS A CHECK CONSTRAINT
-- -------------------------------------------------------------------------
-- The business rule is "the expense->stock bump fires only when BOTH
-- supply_id AND quantity are present". Enforcing that pairing here means the
-- app-layer guard in use-expenses.ts and the DB can never drift into
-- disagreement, and a half-filled row (supply chosen, quantity forgotten)
-- cannot be persisted at all. `quantity > 0` is folded into the same
-- constraint because a zero/negative restock is not a bump — it is a data
-- entry error.
--
-- WHY THERE IS NO CHECK ON amount
-- -------------------------------------------------------------------------
-- Matching external_income.amount (no CHECK). A negative expense is a
-- meaningful entry (a refund/credit from a supplier), and the Resumen tab's
-- SUM handles it correctly with no special case.
--
-- NOTE: THE STOCK BUMP IS NOT WIRED UP IN THIS PR
-- -------------------------------------------------------------------------
-- supply_id/quantity are captured and constrained here, but nothing reads
-- them yet — scripts/046 + lib/hooks/supplies/use-expense-stock-sync.ts (the
-- next PR in this chain) are what apply them to supplies.stock_quantity.
-- Same "column lands one PR before its consumer" pattern as
-- scripts/043's price_adjustment (see that file's header note 3).
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive — a single new table, nothing else touched. To roll back:
--   DROP TABLE expenses;
--
-- ============================================================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  -- (10, 2) matching external_income.amount, NOT supplies.cost_per_unit's
  -- (10, 4) — this is a transacted money amount, not a per-unit rate.
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('supplies', 'services', 'salaries', 'rent', 'other')
  ),
  description TEXT,
  -- RESTRICT, matching order_stock_movements.supply_id (044:64-67) and
  -- product_supplies.supply_id (042) — a supply referenced by expense
  -- history must not be silently deletable; deactivate it instead.
  supply_id UUID REFERENCES supplies(id) ON DELETE RESTRICT,
  -- NUMERIC (not DECIMAL(10,2)) matching supplies.stock_quantity /
  -- product_supplies.quantity — this is a stock amount, and it is added
  -- directly to supplies.stock_quantity by PR5.
  quantity NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- See "WHY THE supply_id/quantity PAIRING IS A CHECK CONSTRAINT" above.
  CONSTRAINT expenses_supply_bump_pairing CHECK (
    (supply_id IS NULL AND quantity IS NULL)
    OR (supply_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0)
  )
);

-- Every read of this table is date-ranged (the Gastos tab's period filter and
-- useOrdersAnalytics' current/previous period SUMs), exactly like
-- external_income's own reads. Mirrors idx_orders_created_at's role.
CREATE INDEX idx_expenses_date ON expenses(date);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table in this
-- repo (scripts/000-baseline-schema.sql / 041 / 044) — single-tenant admin
-- dashboard, not a multi-tenant app with row-level ownership.
CREATE POLICY "Allow all operations on expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);
