-- ============================================================
-- Morfito — gastos-recurrentes, PR1: recurring expense templates (047)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Closes the deferral scripts/045-expenses.sql:21-27 explicitly recorded
-- ("WHY RECURRING EXPENSES ARE NOT MODELLED HERE"). Introduces
-- `recurring_expenses` — TEMPLATES for fixed costs (rent, internet, a
-- monthly cleaning contract, a fortnightly wage) — plus the single nullable
-- FK column on `expenses` that links a logged payment back to the template
-- it satisfies.
--
-- The strategy 045 said it refused to guess is now decided: PRORATION IS
-- COMPUTED ON READ. There is no scheduler, no materialised `expenses` rows,
-- no `next_due_date` column. lib/services/recurring-expenses.ts expands
-- these template rows into per-day allocations inside
-- useOrdersAnalytics' queryFn, every time a period is read. That is why this
-- table has no bookkeeping columns at all: nothing here is ever "consumed"
-- or "advanced", so there is no state to reconcile when a template is
-- closed or a past period is re-read.
--
-- WHY THIS TABLE HAS NO supply_id / quantity
-- -------------------------------------------------------------------------
-- Confirmed product decision: a recurring expense NEVER touches stock, not
-- even with category = 'supplies'. One-off `expenses` rows do (045's
-- expenses_supply_bump_pairing CHECK + scripts/046's ledger), and that
-- asymmetry is intentional: a monthly template is an ALLOCATION of money
-- across days, not a delivery of goods on a day, so there is no moment at
-- which stock would arrive. Rather than guarding the rule in
-- lib/hooks/expenses/use-recurring-expenses.ts, the columns simply do not
-- exist — the rule is unrepresentable instead of merely unenforced. This is
-- 045's "make the pairing a CHECK" posture, applied by omission.
--
-- WHY amount IS NULLABLE, AND THE ONE-DIRECTIONAL CHECK ON IT
-- -------------------------------------------------------------------------
-- Two behaviours share this table, gated by `frequency`:
--   * monthly     — carries an amount, prorated daily into expensesTotal.
--   * weekly/biweekly — INFORMATIONAL ONLY. They declare a payment cadence
--     (an hourly employee paid every fortnight) whose amount is not knowable
--     in advance. They contribute EXACTLY ZERO money; the real payment is a
--     one-off `expenses` row, linked back here by recurring_expense_id.
--
-- Hence: monthly REQUIRES an amount (a NULL there would prorate to a silent
-- 0, not an error), while weekly/biweekly are NOT forbidden from carrying
-- one. That asymmetry is deliberate. lib/services/recurring-expenses.ts
-- skips every non-monthly template UNCONDITIONALLY — it does not test
-- `amount != null` — because the one-off row is the source of truth for
-- that payment and a template that both prorated AND had a matching logged
-- payment would double-count the same money. A CHECK forbidding the column
-- would make that unconditional skip look redundant and invite a future
-- "simplification" into an amount-based test, reintroducing the bug.
--
-- WHY end_date IS INCLUSIVE, AND WHAT THAT COSTS
-- -------------------------------------------------------------------------
-- end_date is the LAST day the template applies, not the first day it stops.
-- Consequence for the close-and-replace flow (the ONLY way to change an
-- active template's amount — a template's amount is never UPDATEd, so
-- historical proration stays intact): the closed row's end_date must be the
-- day BEFORE the replacement's start_date, or that day is charged twice.
-- lib/utils/calendar-date.ts::dayBefore exists for exactly this, and the
-- CHECK below (end_date >= start_date) makes the zero-length window
-- unrepresentable.
--
-- WRITE ORDERING FOR CLOSE-AND-REPLACE: INSERT FIRST, UPDATE SECOND
-- -------------------------------------------------------------------------
-- The two writes are not in a transaction (Supabase JS has no client-side
-- transaction; see use-order-stock-sync.ts:55-62 for this repo's standing
-- position on that). Crash between them, ordered UPDATE-then-INSERT: the old
-- row is closed with no replacement and the fixed cost silently DISAPPEARS
-- from every later period — invisible, and it makes profit read
-- optimistically high, which is the exact failure this whole feature exists
-- to fix. Ordered INSERT-then-UPDATE: both rows are briefly active and the
-- cost is counted TWICE — wrong, but conservative, and immediately visible
-- as two same-description rows both badged "Activo" in the list the operator
-- is already looking at. THE VISIBLE FAILURE ALWAYS BEATS THE INVISIBLE ONE.
--
-- WHY THERE IS NO INDEX ON start_date
-- -------------------------------------------------------------------------
-- Deliberate inversion of 045:101-103's reasoning, and the inversion is the
-- point. `expenses` is indexed on `date` because every read of it is
-- date-ranged. Every read of THIS table is the opposite: the templates query
-- in use-orders-history.ts carries NO date filter, on purpose. A template
-- with start_date in 2024 and end_date IS NULL still contributes to this
-- month, so any gte("start_date", periodStart) would silently drop exactly
-- the long-running templates the feature exists for. Overlap is decided in
-- the pure function, never in SQL. An index on a column no query filters by
-- is write amplification plus a false signal about how the table is read.
--
-- WHY expenses.recurring_expense_id IS ON DELETE SET NULL (never CASCADE)
-- -------------------------------------------------------------------------
-- A logged payment is real money that left the business. Deleting a template
-- must NEVER delete it. CASCADE here would let one click erase expense
-- history that already moved a reported number. SET NULL degrades the row to
-- exactly what it was before this migration existed: a valid one-off expense
-- that no longer knows which template it satisfied.
-- The partial index below exists for THIS referential action — PG does not
-- auto-index FK columns, and SET NULL scans `expenses` on every template
-- delete. It is NOT for the "N de M pagos cargados" counter, which matches
-- in JS over the period's already-loaded expenses.
--
-- WHY THE DELETE WINDOW IS NOT AN RLS POLICY
-- -------------------------------------------------------------------------
-- Product rule: a template may be deleted only while start_date >= today in
-- AR time; once it has started, the only exit is end_date. That is enforced
-- in the app (the mutation refuses, and the UI omits the button entirely),
-- NOT by a FOR DELETE policy, because a policy would need its own
-- AT TIME ZONE 'America/Argentina/Buenos_Aires' derivation of "today" —
-- a SECOND definition, against the DB server clock, disagreeing with the
-- app's exactly at the boundary the rule is about. This table keeps the same
-- allow-all posture as every other table in this repo (045:108-110).
-- REVISIT IF a second client (mobile app, script, integration) ever writes
-- here — at that point the policy is worth its cost.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive: one new table plus one nullable column that starts NULL
-- on every existing row (catalog-only ALTER, no table rewrite, no backfill).
-- To roll back — ORDER MATTERS, the column's FK depends on the table:
--   DROP INDEX idx_expenses_recurring_expense_id;
--   ALTER TABLE expenses DROP COLUMN recurring_expense_id;
--   DROP TABLE recurring_expenses;
-- Dropping the column loses only the payment<->template link; the `expenses`
-- rows themselves are untouched.
--
-- ============================================================

-- ============================================================
-- 1. recurring_expenses — the templates
-- ============================================================

CREATE TABLE recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for weekly/biweekly (informational cadence, no knowable amount).
  -- (10, 2) matching expenses.amount / external_income.amount — a transacted
  -- money amount, not a per-unit rate.
  amount DECIMAL(10, 2),
  -- Same five values as expenses.category, same CHECK-enum posture and the
  -- same reasoning (045:29-37). A template's category is what
  -- expensesByCategory buckets its prorated share into, so the two column
  -- domains MUST stay identical — a value here that `expenses` cannot hold
  -- would produce a category the UI has no card for.
  category TEXT NOT NULL CHECK (
    category IN ('supplies', 'services', 'salaries', 'rent', 'other')
  ),
  -- NOT NULL, unlike expenses.description (which is nullable). This string
  -- IDENTIFIES the template in the list, in the update dialog and in the
  -- "Cargar pago" prefill — an unnamed fixed cost is not usable. Note it is
  -- deliberately NOT a join key: the payment counter matches on
  -- expenses.recurring_expense_id, so renaming this never breaks anything.
  description TEXT NOT NULL,
  -- Generic across ALL categories: a weekly cleaning service is
  -- frequency='weekly', category='services'. No coupling to 'salaries'.
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (
    frequency IN ('weekly', 'biweekly', 'monthly')
  ),
  start_date DATE NOT NULL,
  -- INCLUSIVE last day the template applies. NULL = still active.
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- See "WHY amount IS NULLABLE, AND THE ONE-DIRECTIONAL CHECK ON IT".
  -- Monthly requires an amount; weekly/biweekly are NOT forbidden one.
  CONSTRAINT recurring_expenses_monthly_amount CHECK (
    frequency <> 'monthly' OR amount IS NOT NULL
  ),
  -- See "WHY end_date IS INCLUSIVE". A zero/negative-length window is a
  -- template that exists and charges nothing — a data-entry error, not a
  -- state worth representing. Also the reason the update dialog bounds its
  -- date picker to effectiveFrom > start_date.
  CONSTRAINT recurring_expenses_period_order CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

-- NO index on start_date — see "WHY THERE IS NO INDEX ON start_date" above.

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table in this
-- repo (045:108-111). Deliberately NOT split into a narrowed FOR DELETE
-- policy — see "WHY THE DELETE WINDOW IS NOT AN RLS POLICY" above.
CREATE POLICY "Allow all operations on recurring_expenses" ON recurring_expenses FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. expenses — the link from a logged payment back to its template
-- ============================================================

-- Plain ADD COLUMN (never IF NOT EXISTS), matching 043:68-83's style.
-- Nullable with no default: catalog-only in PG 11+, no rewrite, and every
-- pre-existing row correctly reads "this payment is not linked to any
-- template" rather than needing a backfill.
ALTER TABLE expenses
  ADD COLUMN recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;

-- Partial: the vast majority of expense rows never carry this FK, so the
-- index stays small and ordinary one-off inserts don't pay for it. Exists
-- for the ON DELETE SET NULL scan, not for the payment counter — see the
-- header.
CREATE INDEX idx_expenses_recurring_expense_id
  ON expenses(recurring_expense_id)
  WHERE recurring_expense_id IS NOT NULL;
