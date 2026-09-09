-- ============================================================
-- Morfito — /finanzas consolidation, PR5: expense stock movements (046)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- The append-only ledger of raw-supply stock actually INCREMENTED by a
-- supply-purchase expense, written/read by
-- lib/hooks/supplies/use-expense-stock-sync.ts. Depends on `expenses`
-- (scripts/045-expenses.sql) and `supplies`
-- (scripts/041-supplies-and-stock.sql).
--
-- WHY A SEPARATE TABLE INSTEAD OF EXTENDING order_stock_movements
-- -------------------------------------------------------------------------
-- Extending 044's table would have required DROPping the very
-- UNIQUE(order_id, supply_id) constraint that 044:29-38 designates as THE
-- idempotency guard and that use-order-stock-sync.ts:192-199 swallows 23505
-- from by code — a destructive change to a live, just-shipped path, in
-- exchange for nothing. It would also have relaxed order_id to nullable,
-- contradicting 044:15-27's stated invariant ("the ledger answers how much
-- of supply X has this ORDER consumed"), and degraded the reverse path's
-- index reasoning at 044:40-47 from unconditional to predicate-dependent.
--
-- The decisive reason, though, is semantic: these two ledgers have OPPOSITE
-- STOCK SIGN. An order movement is consumption (apply => decrement); an
-- expense movement is restock (apply => increment). Sharing one table would
-- make the direction of the stock write implicit in which FK column happens
-- to be non-null. Two tables keep `quantity` unambiguous in each: here it is
-- always a positive amount ADDED to supplies.stock_quantity.
--
-- WRITE ORDERING IS THE MIRROR IMAGE OF THE ORDER PATH, NOT A COPY
-- -------------------------------------------------------------------------
-- use-order-stock-sync.ts:28-39 biases every failure mode toward
-- UNDER-counting stock. Because this path's sign is inverted, copying its
-- ORDERINGS would invert its BIAS. The generalised rule that produces
-- correct orderings for both paths is:
--
--   THE STOCK-LOWERING WRITE ALWAYS GOES FIRST;
--   THE STOCK-RAISING WRITE ALWAYS GOES LAST.
--
-- Applied here: apply inserts the ledger row BEFORE incrementing stock
-- (crash => stock not raised, ledger present, retry is a no-op => under-count);
-- reverse decrements stock BEFORE deleting the ledger row (crash => stock
-- lowered, ledger present, retry lowers again => under-count). See
-- use-expense-stock-sync.ts's header for the full four-case table.
--
-- WHY expense_id IS ON DELETE CASCADE, AND THE TRAP THAT CREATES
-- -------------------------------------------------------------------------
-- CASCADE matches 044's order_id and keeps the ledger from outliving its
-- expense. BUT: if the delete mutation removed the `expenses` row first, the
-- cascade would silently erase the ledger row and the stock would never be
-- decremented back. use-expenses.ts's delete path MUST therefore run in this
-- order: (1) decrement supplies.stock_quantity, (2) DELETE the ledger row,
-- (3) DELETE the expenses row. The CASCADE below is a backstop for a direct
-- DB delete only — it is NOT the reversal mechanism.
--
-- STOCK REVERSAL DOES NOT FLOOR AT ZERO
-- -------------------------------------------------------------------------
-- Confirmed business rule, consistent with 041's "DELIBERATE DESIGN CHOICES"
-- note and lib/types/index.ts:143-146 — negative stock is an allowed,
-- meaningful state that /finanzas' Insumos tab surfaces, never something
-- clamped away silently.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo.
--
-- REVERSIBILITY
-- --------------
-- Purely additive — a single new table, nothing else touched. To roll back:
--   DROP TABLE expense_stock_movements;
-- (Stock already bumped by applied expenses is NOT unwound by that DROP —
-- reverse the affected expenses through the UI first, or adjust manually.)
--
-- ============================================================

CREATE TABLE expense_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  -- Always POSITIVE and always ADDED to supplies.stock_quantity — see "WHY A
  -- SEPARATE TABLE" above for why this column's direction is unambiguous
  -- here and would not have been in a merged ledger.
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- THE idempotency guard, mirroring 044's UNIQUE(order_id, supply_id). An
  -- expense carries at most one supply line today, so this is effectively
  -- UNIQUE(expense_id) — keyed on the pair anyway so a future multi-line
  -- expense needs no migration, and so the two ledgers stay readably
  -- symmetric.
  UNIQUE (expense_id, supply_id)
);

ALTER TABLE expense_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on expense_stock_movements" ON expense_stock_movements FOR ALL USING (true) WITH CHECK (true);
