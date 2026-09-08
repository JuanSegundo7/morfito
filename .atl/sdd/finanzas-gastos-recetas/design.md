# Design: finanzas-gastos-recetas — Consolidated /finanzas (Resumen · Gastos · Insumos · Recetas)

> **Size note**: this document deliberately exceeds the sdd-design 800-word budget. The launch prompt explicitly required full DDL, full TypeScript signatures, a line-precise file-change list, and 8 named resolutions at the rigor bar of `sdd/porting-cost-stock-finance/design`. Explicit instruction wins over the generic budget.

## Verification Basis

Every claim below was verified against working-tree source, not the proposal's citations. Deltas found:

| Proposal claim | Verified reality |
|---|---|
| `middleware.ts:39-42` gate | Actual gate: `isPathGatedByInactiveService` at **`middleware.ts:33-44`**; the href match loop is **39-42**. Correct. |
| `middleware.ts:31` NEVER_GATED_PATHS | **Exact** (`middleware.ts:31`). |
| `middleware.ts:97-102` layer-3 redirect | **Exact**. |
| `SERVICE_NAV_HREFS.stock_management = ["/insumos"]` | **Exact** (`lib/service-nav-map.ts:10`). |
| `use-create-order.ts:104` nets commission into `total_amount` | **Exact**: `const total = itemsTotal + priceAdjustment - discountAmount - commissionAmount + input.delivery_fee;` (`:103-104`), persisted as `total_amount` (`:118`). **Net-revenue decision D5 is confirmed correct.** |
| jebbs' `use-expenses.ts` has no update hook | Could not access jebbs. **Irrelevant** — morfito already has its own create+delete-only precedent: `lib/hooks/orders/use-external-income.ts` (read/create/delete, no update). We mirror morfito, not jebbs. |
| `RecipeEditor` has no `/precios` coupling | **Confirmed**. `components/precios/recipe-editor.tsx:25-27` props are `{ productId: string }` only; imports are `use-supplies`, `use-product-supplies`, `use-products`, `format` — zero page-scoped state, zero `/precios` imports. Safe to remount anywhere. |

Additional findings the proposal did not mention (all load-bearing below):

- **No test runner exists.** `package.json:5-10` scripts are `build`/`dev`/`lint`/`start`. No vitest/jest dep, no config, zero `*.test.ts` outside `node_modules`. See D8.
- **`next.config.mjs` has `typescript.ignoreBuildErrors: true` (`:3-5`) and no `redirects()` block.** Type errors do **not** fail `next build`. See D3 and Testing Strategy.
- **`useOrdersAnalytics` already reads a DATE-typed sibling table** (`external_income`, `use-orders-history.ts:183-192`) using `toArDateStr(start/end)` strings, not ISO timestamps. `expenses.date` is the same shape, so the new queries drop into that exact slot.
- **`/precios`'s cost block has a non-obvious correctness trick** at `precios/page.tsx:147-150`: recipe lines' embedded `supply` join is **rebuilt from `["all-supplies"]`** because `["product-supplies-bulk", …]` is not invalidated by `invalidateSupplyQueries` (`use-supplies-crud.ts:13-24` invalidates it — but the *bulk join payload* still carries the old embedded row until refetch). Plus the `if (!allSupplies) return map;` cold-load guard at `:136`. **Both must be ported verbatim to the Recetas tab** or the "Receta incompleta" flash and stale-cost bugs return.

---

## Technical Approach

Five units across six PRs, each independently revertible. The shape is: **one new route shell owning four tabs; two purely-additive migrations; one new pure-logic function; one new I/O module that is a structural mirror of an already-shipped one.**

The load-bearing structural idea is that this change adds **exactly two new "brains"** — `lib/services/recipe-cost.ts::computeMakeableCount` (pure, already-tested-by-design module) and `lib/services/finance-summary.ts::computeNetRevenue` (new, pure, single-subtraction). Every other new file is either I/O plumbing that mirrors a shipped sibling or presentation. No new arithmetic lives in a component.

```
                       app/(dashboard)/finanzas/page.tsx   (server; <Suspense>)
                                    │
                    components/finanzas/finanzas-tabs.tsx  (client; owns ?tab= sync)
        ┌───────────────┬───────────┴──────────┬────────────────────┐
   resumen-tab      gastos-tab            insumos-tab          recetas-tab
        │                │                     │                    │
useOrdersAnalytics   useExpenses /       useAllSupplies /     useProducts /
 (+expenses,          useCreateExpense    useDeleteSupply /   useProductSuppliesBulk /
  +commission)        useDeleteExpense    useToggleSupplyActive  useAllSupplies
        │                │                     │                    │
        ▼                ▼                     ▼                    ▼
lib/services/      lib/hooks/supplies/   components/supplies/*  lib/services/recipe-cost.ts
finance-summary.ts use-expense-stock-      (REUSED as-is)       computeProductCost +
computeNetRevenue  sync.ts (ledger I/O)                         computeMakeableCount
                          │                                            │
                          ▼                                            ▼
                  expense_stock_movements                    components/finanzas/
                  + supplies.stock_quantity                  recipe-editor.tsx (MOVED)
```

---

## Architecture Decisions

### D1 — Ledger schema: **new `expense_stock_movements` table (option A)**

**Choice**: a separate table with `UNIQUE(expense_id, supply_id)`, structurally identical to `order_stock_movements`.

**Rejected**: extending `order_stock_movements` with a nullable `expense_id` + nullable `order_id` + two partial unique indexes.

**Rationale (from reading 044 + `use-order-stock-sync.ts`, not from the proposal's lean)** — option B is not "one migration touching a table"; it is four destructive operations on a ledger whose invariants are load-bearing for already-merged code:

1. **It requires `DROP CONSTRAINT` on the exact object 044 designates as the idempotency guard.** `scripts/044-order-stock-movements.sql:29-38` documents `UNIQUE(order_id, supply_id)` as *the* guard, and `use-order-stock-sync.ts:192-199` swallows its `23505` by code. Dropping and re-creating that as a partial index changes which error code a colliding insert raises for the concurrent-double-click race. If the partial-index violation reports differently (or the constraint name changes and someone narrows the check), the swallow silently becomes a thrown error surfaced to the "mark completed" mutation. That is a live-path regression for zero functional gain.
2. **It silently degrades the reverse path's index.** `044:40-47` explicitly reasons that no separate `order_id` index is needed *because* the composite UNIQUE leads with `order_id`, and that `reverseDeduction`'s `.eq("order_id", orderId)` (`use-order-stock-sync.ts:207-211`) rides it. A partial unique index `WHERE order_id IS NOT NULL` still leads with `order_id`, but the reasoning is now conditional on a predicate — a subtlety that will not survive the next person's edit.
3. **The two ledgers are not "near-identical"; their stock effect has opposite sign.** An order movement is *consumption* (apply ⇒ decrement). An expense movement is *restock* (apply ⇒ increment). Folding them into one table makes the direction of the stock write implicit in *which FK column happens to be non-null* — the single worst kind of coupling to introduce into money/stock code. `044:61-73`'s `quantity NUMERIC NOT NULL CHECK (quantity > 0)` reads as "amount consumed"; under B the same column would mean "amount consumed OR amount restocked", and every reader has to branch to know.
4. **`order_id UUID NOT NULL` relaxing to nullable directly contradicts 044's stated invariant** (`:15-27`: "the ledger answers *how much of supply X has this ORDER consumed*").

The cost of A is one extra table and ~30 duplicated lines of I/O. That is cheap, reviewable, independently rollbackable (`DROP TABLE expense_stock_movements;`), and cannot regress the shipped order path *at all*. The duplication is also honest: the two paths differ in write ordering (see D2), so a shared implementation would have needed a direction parameter anyway.

### D2 — Idempotency + write ordering: **"the stock-lowering write always goes first; the stock-raising write always goes last."**

**Choice**: a single invariant that generates all four orderings, rather than four independently-memorised rules.

`use-order-stock-sync.ts:28-39` states the goal as "every failure mode is biased toward UNDER-counting stock". It then derives two orderings. Because the expense path's sign is inverted, mechanically copying its *orderings* would invert the *bias* and produce over-counting. Restating the goal as one rule about which write lowers stock yields correct orderings for both paths:

| Path | Stock effect | Ordering | Crash-window outcome |
|---|---|---|---|
| Order apply (shipped) | decrement | decrement → INSERT ledger | under-counts ✅ |
| Order reverse (shipped) | increment | DELETE ledger → increment | under-restores ✅ |
| **Expense apply (new)** | **increment** | **INSERT ledger → increment** | stock not raised, ledger present ⇒ retry is a no-op ⇒ under-counts ✅ |
| **Expense reverse (new)** | **decrement** | **decrement → DELETE ledger** | stock lowered, ledger present ⇒ retry lowers again ⇒ under-counts ✅ |

Both new orderings are the **mirror image** of their order-path counterparts, which is exactly why blind mirroring would have been wrong. This must be stated verbatim in `use-expense-stock-sync.ts`'s header.

Idempotency mechanics are otherwise identical to `applyDeductionPlan` (`use-order-stock-sync.ts:152-199`): pre-read the ledger for this `expense_id`, hard no-op if a row already exists, and swallow `23505` from the INSERT as already-applied. Because the ledger INSERT now comes *first*, the `23505` swallow is strictly safer here than in the order path — no decrement has happened yet when the collision is detected, so there is **no** analogue of the order path's admitted "possible extra decrement in that one narrow window" (`:50-54`).

**Delete ordering has a third step.** `expense_stock_movements.expense_id` is `ON DELETE CASCADE` (mirroring 044). If the mutation deleted the `expenses` row first, the cascade would silently erase the ledger row and the stock would never be decremented. The delete mutation must therefore run: **(1) decrement `supplies.stock_quantity`, (2) DELETE the ledger row, (3) DELETE the `expenses` row.** CASCADE remains as the backstop for a direct-DB delete only.

**Reversal does not floor at zero** (per the business rules, and consistent with `041:71-73` / `lib/types/index.ts:143-146` — negative stock is a valid, meaningful state).

**Failure UX.** No transaction spans the `expenses` INSERT and the stock UPDATE (Supabase JS has no client-side transaction; `use-order-stock-sync.ts:55-62` documents that no RPC exists in this repo and declines to add one). So the create mutation commits the expense first, then attempts the bump. On bump failure the UI must say *"El gasto se registró, pero no se pudo actualizar el stock de {supply}. Ajustalo manualmente en la pestaña Insumos."* — **never a retry affordance**, because a retry after a partially-applied bump has no way to know how far it got. See D6 for why the retry button is structurally absent rather than merely omitted.

### D3 — `/insumos` redirect: **server-component `redirect()` in `app/(dashboard)/insumos/page.tsx`**

**Choice**: delete the `"use client"` body, replace the file with a ~10-line server component calling `redirect("/finanzas?tab=insumos")` from `next/navigation`. Temporary (307), **not** `permanentRedirect`.

**Rejected**:
- **`redirects()` in `next.config.mjs`** — the file currently has no `redirects()` block at all (`next.config.mjs:1-11`). Introducing one creates a second, invisible routing surface: a developer grepping the `app/` tree for `/insumos` would find the route gone and no explanation. The route-tree file is where they will look.
- **Client-side `router.replace` in a `useEffect`** — requires mount + hydration before redirecting, so the operator sees a blank/flashing frame, and it does nothing for a non-JS/crawler request. Strictly worse on every axis.
- **`permanentRedirect` (308)** — browsers cache 308s aggressively and near-permanently. The product decision is explicitly *"redirect, not hard retire"*; a 308 would make reinstating `/insumos` effectively impossible for anyone who visited once.

**Rationale**: idiomatic App Router, zero flash, works without JS, co-located with the route it replaces, and trivially deletable when `/insumos` is eventually retired for real. Gating still works because `SERVICE_NAV_HREFS.stock_management` keeps `/insumos` in its list, so middleware's `isPathGatedByInactiveService` (`middleware.ts:33-44`) intercepts a gated account at `/insumos` and sends it to `/plan` **before** the page component ever runs — no double-bounce.

### D4 — Gating: add `/finanzas` to `SERVICE_NAV_HREFS.stock_management`

**Choice**: `stock_management: ["/finanzas", "/insumos"]`.

Verified this needs no other change: `middleware.ts:39-42` matches `pathname === href || pathname.startsWith(href + "/")`. **`pathname` excludes the query string**, so `/finanzas?tab=insumos` matches on `/finanzas` and is gated whole-page — exactly the confirmed product decision, with no per-tab logic anywhere. `sidebar.tsx:71-77`'s `isNavItemVisible` uses `hrefs.includes(href)` (exact match against the nav item's own href), so adding `/finanzas` to the array both gates the new route in middleware and hides the new sidebar item — one edit, two enforcement points, no drift. `/finanzas` is not in `NEVER_GATED_PATHS` (`middleware.ts:31`), correctly.

### D5 — Net revenue: **`lib/services/finance-summary.ts::computeNetRevenue`, the only subtraction in the codebase**

**Choice**: a new pure module with one exported function, called from exactly one place (`useOrdersAnalytics`'s `queryFn`). Components read `analytics.netRevenue` and only `formatCurrency` it. No component performs money arithmetic.

**Rejected**:
- **Computing `netRevenue` inline in each of the three consuming components** — this is precisely the double-subtraction failure mode the proposal flagged as the highest-stakes risk in the change.
- **A `netRevenue` DB view or generated column** — would need to re-derive the AR-timezone period boundaries (`use-orders-history.ts:16-45`) in SQL. Duplicating that logic across two languages is a far worse correctness risk than the one it prevents.

**Why it is structurally hard to get wrong** — three enforcing properties, not one:

1. **The subtraction exists once, in a pure function, in a file with no other exports doing arithmetic.** A reviewer can verify the formula by reading ~15 lines.
2. **The parameter is named to carry its own warning.** The input field is `commissionTotalInformational`, and the function body never references it in the `netRevenue` expression — it only passes it through to the result. A future edit that tries to subtract it has to first rename a field whose name says not to.
3. **The result type has no operands, only outputs.** `NetRevenueResult` exposes `netRevenue` as a finished number. There is no `subtract(...)` helper and no exported constant that invites recomposition downstream.

Backed by the doc comment citing `use-create-order.ts:103-104` verbatim as the reason commission is already netted.

### D6 — Expense hooks mirror `use-external-income.ts`, not jebbs

**Choice**: `lib/hooks/expenses/use-expenses.ts` exporting `useExpenses(startDate, endDate)`, `useCreateExpense(startDate, endDate)`, `useDeleteExpense(startDate, endDate)`. **No update hook.**

**Rationale**: `lib/hooks/orders/use-external-income.ts` is morfito's own, already-shipped, structurally identical hook family — a date-ranged DATE-column table with a create+delete-only surface (`:11-82`). We do not need to verify jebbs at all; the local precedent is stronger evidence than the upstream one. The absence of an update hook is also what makes D2's "no retry affordance" structural rather than a UI convention: with no update path, a half-applied bump physically cannot be "retried" through the expense record — the only route is the Insumos tab's manual `useAdjustSupplyStock`, which is what the error copy points at.

**Where the files live**: `lib/hooks/expenses/` (new folder, matching this repo's group-by-noun convention: `lib/hooks/orders/`, `lib/hooks/supplies/`). The ledger I/O goes to **`lib/hooks/supplies/use-expense-stock-sync.ts`** — deliberately *not* under `expenses/` — so it sits directly beside `use-order-stock-sync.ts`, its structural mirror, where a reader comparing the two write orderings will find them adjacent. `use-external-income.ts` stays under `orders/` (moving it is out of scope and would inflate the diff).

### D7 — `RecipeEditor` **moves** to `components/finanzas/recipe-editor.tsx`

**Choice**: `git mv components/precios/recipe-editor.tsx components/finanzas/recipe-editor.tsx`, body unchanged.

**Rejected**: leaving it at `components/precios/` and importing it from the Recetas tab.

**Rationale**: after PR3 removes the `/precios` mount (`precios/page.tsx:577`), `components/precios/` would contain a component that `/precios` no longer uses — a permanently misleading path in a directory whose name is its only documentation. Git detects the rename, so GitHub renders it as a rename with ~0 effective review lines; the real diff is one import line. Verified safe: the component has no `/precios` coupling (props `{ productId }` only; `recipe-editor.tsx:25-27, 15-23`).

**Known cost — two stale doc-comment citations must be updated in the same PR** or they become lies:
- `lib/services/recipe-cost.ts:7-8` — "see components/precios/recipe-editor.tsx and app/(dashboard)/precios/page.tsx"
- `scripts/042-product-supplies.sql:12` — "(components/precios/recipe-editor.tsx)"

(A migration file is normally append-only, but `042:12` is a prose comment, not DDL; editing it changes no schema. If the team prefers migrations be byte-frozen, leave `042` and note the rename in `046`'s header instead. Flagged for `sdd-tasks`.)

### D8 — Introduce **vitest** in PR2 (scope addition — needs sign-off)

**Choice**: add `vitest` as a devDependency + `"test": "vitest run"` script + `lib/services/recipe-cost.test.ts`.

**Rationale**: `lib/services/recipe-cost.ts:3-13` states the module is pure "deliberately, so this can be unit-tested in isolation" — the *intent* shipped, the harness never did. `computeMakeableCount` is the highest-value pure function in this change (MIN-across-lines with an epsilon guard, a negative-stock clamp, and three distinct exclusion rules), and PR2 is logic-only and the lowest-risk PR in the chain — the correct place to land a harness. vitest needs no jsdom for pure functions and adds zero runtime bytes.

**This is beyond the proposal's "PR2, ~150 lines" estimate** (config + deps ≈ +40 lines, tests ≈ +120). PR2 realistically lands at ~300 lines — still comfortably inside the 400-line budget, but the orchestrator should surface the harness addition to the user before apply. If declined, PR2 ships `computeMakeableCount` with a documented manual-verification matrix instead and the "+ tests" scope item is dropped explicitly rather than silently.

**Note**: `next.config.mjs:3-5` sets `typescript.ignoreBuildErrors: true`, so `next build` passing proves nothing about types. `npx tsc --noEmit` must be run manually in every PR of this chain.

### D9 — Resumen tab query firing: conditional render, belt-and-braces

**Choice**: `<TabsContent value="resumen">{activeTab === "resumen" && <ResumenTab />}</TabsContent>`.

Radix `Tabs.Content` already unmounts inactive content unless `forceMount` is set, so the hooks inside `ResumenTab` would not run anyway. But that is an *implicit* guarantee one `forceMount` prop away from silent breakage (someone adding a tab-crossfade animation would re-enable a six-query analytics fetch on every page load). The explicit `&&` costs one line and is immune. No `enabled` plumbing is added to `useOrdersAnalytics`, so `/rendimiento`'s existing call site is untouched.

---

## Data Flow — expense create with stock bump (PR5)

```
GastosTab ──submit──▶ useCreateExpense.mutationFn
                            │
                            ├─(1) INSERT expenses  ─────────────▶ committed, id in hand
                            │                                     (past this point the
                            │                                      expense EXISTS no
                            │                                      matter what follows)
                            ├─(2) supply_id && quantity present?
                            │        no ──▶ done
                            │        yes ▼
                            │     applyExpenseStockBump(supabase, expenseId, supplyId, qty)
                            │        ├─ SELECT expense_stock_movements WHERE expense_id=…
                            │        │     row exists ──▶ HARD NO-OP (return)
                            │        ├─ INSERT ledger row   ◀── ledger FIRST (D2)
                            │        │     23505 ──▶ swallow, return (already applied)
                            │        └─ SELECT stock_quantity; UPDATE stock_quantity + qty
                            │
                            └─(3) onSuccess: invalidateExpenseQueries(qc, { touchedStock })
                                  onError-after-(1): "adjust manually" toast, NO retry
```

Reverse (delete) runs the mirror: `UPDATE stock_quantity − qty` → `DELETE` ledger → `DELETE` expense.

---

## Migrations

### `scripts/045-expenses.sql` (PR4)

```sql
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
```

### `scripts/046-expense-stock-movements.sql` (PR5)

```sql
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
```

---

## Interfaces / Contracts

### `lib/services/recipe-cost.ts` — additions (PR2)

Appended below `computeMargin`. Reuses `resolveRecipeQuantities` (`:71-82`) — the same resolved-quantity array `computeProductCost` builds at `:101` — so scaling can never drift between cost and makeable-count math.

```ts
/**
 * Floor below which a resolved recipe quantity is treated as "does not
 * constrain production" rather than as a divisor. Guards against both a
 * literal 0 and the float dust a scaled quantity can leave behind (e.g.
 * 0.1 * 3 - 0.3 === 5.55e-17), which would otherwise divide into an
 * astronomically large, meaningless makeable count.
 */
const QUANTITY_EPSILON = 1e-9;

export interface MakeableCountResult {
  /**
   * How many whole units of the product current stock supports, or null when
   * NO line constrains production at all (empty recipe, or every line's
   * effective quantity is <= QUANTITY_EPSILON). Null means "unbounded /
   * unknown" and MUST NOT be rendered as 0 — a recipe-less product is not a
   * product you cannot make.
   */
  count: number | null;
  /** supply_id of the line that produced the MIN. Null iff `count` is null. */
  limitingSupplyId: string | null;
  /**
   * True when at least one recipe line's supply could not be resolved at
   * all. Such a line contributes 0 to the MIN (see computeLineMakeable) —
   * deliberately under-reporting, since "we have no idea how much of this we
   * have" must never read as "plenty". Mirrors ProductCostResult.incomplete's
   * role: the flag, not a silently-wrong number, is what tells the UI the
   * answer isn't the full picture.
   */
  incomplete: boolean;
}

/**
 * How many whole units one recipe line supports. Returns null when the line
 * does not constrain production (effectiveQuantity <= QUANTITY_EPSILON) —
 * per the confirmed business rule, a quantity <= 0 line contributes NOTHING
 * to the MIN rather than contributing zero.
 *
 * Clamped at 0 because supplies.stock_quantity is legitimately allowed to go
 * negative (scripts/041-supplies-and-stock.sql's "DELIBERATE DESIGN
 * CHOICES"), and Math.floor(-5 / 2) === -3 — a negative makeable count is
 * meaningless to render.
 */
export function computeLineMakeable(
  stockQuantity: number,
  effectiveQuantity: number,
): number | null {
  if (effectiveQuantity <= QUANTITY_EPSILON) return null;
  return Math.max(0, Math.floor(stockQuantity / effectiveQuantity));
}

/**
 * MIN across a product's recipe lines of how many whole units each line's
 * current stock supports.
 *
 * Shares `resolveRecipeQuantities` with computeProductCost (see that
 * function) rather than re-deriving quantity * factor, so variant scaling
 * can never drift between what a product COSTS and how many of it you can
 * MAKE.
 *
 * INACTIVE supply lines are INCLUDED in the MIN, deliberately: an inactive
 * supply still has a real stock_quantity, and counting it under-reports at
 * worst (you may be able to make more than we say) — whereas excluding it
 * would over-report (we'd claim you can make units that need an ingredient
 * you've retired). Under-reporting is the safe direction for a production
 * ceiling. Note this differs from computeProductCost, which EXCLUDES
 * inactive lines from `total` — the two are not inconsistent: excluding an
 * unknown cost avoids a wrong number, while excluding a known stock level
 * would create one.
 */
export function computeMakeableCount(
  recipe: ProductSupplyWithSupply[],
  variantFactors?: Record<string, number>,
): MakeableCountResult {
  const effectiveQuantities = resolveRecipeQuantities(recipe, variantFactors);

  let count: number | null = null;
  let limitingSupplyId: string | null = null;
  let incomplete = false;

  recipe.forEach((line, index) => {
    const supply = line.supply;
    if (!supply) {
      incomplete = true;
    }

    const lineMakeable = computeLineMakeable(
      // A missing supply contributes 0 (hard ceiling), not "skip" — see
      // MakeableCountResult.incomplete.
      supply ? supply.stock_quantity : 0,
      effectiveQuantities[index],
    );

    if (lineMakeable === null) return;
    if (count === null || lineMakeable < count) {
      count = lineMakeable;
      limitingSupplyId = line.supply_id;
    }
  });

  return { count, limitingSupplyId, incomplete };
}
```

### `lib/services/finance-summary.ts` — new (PR6)

```ts
/**
 * /finanzas consolidation, PR6. Pure functions only — no supabase/react
 * imports, same posture as lib/services/recipe-cost.ts, so this can be unit
 * tested in isolation.
 *
 * THIS MODULE EXISTS FOR EXACTLY ONE REASON: to be the SINGLE place net
 * revenue is computed, so the double-subtraction bug below cannot be
 * reintroduced by a second call site.
 *
 * COMMISSION IS ALREADY NETTED OUT OF orders.total_amount.
 * -------------------------------------------------------------------------
 * lib/hooks/orders/use-create-order.ts:103-104 persists
 *   total_amount = itemsTotal + priceAdjustment - discountAmount
 *                  - commissionAmount + delivery_fee
 * so every SUM(orders.total_amount) — including
 * useOrdersAnalytics' `totalRevenue` — is ALREADY net of commission.
 * Subtracting SUM(orders.commission_amount) from it would deduct the same
 * money twice and silently under-report the operator's net revenue.
 *
 * commissionTotal is therefore INFORMATIONAL ONLY: an "así se repartió"
 * line the Resumen tab displays so the operator can see how much the
 * channels took, NOT an operand. Its input field is named
 * `commissionTotalInformational` precisely so that anyone reaching for it in
 * an arithmetic expression has to first ignore the field's own name.
 */

export interface NetRevenueInput {
  /** SUM of completed orders' total_amount + external_income.amount, for the
   *  period. Already net of commission — see this module's header. */
  totalRevenue: number;
  /** SUM of expenses.amount for the period. */
  expensesTotal: number;
  /** SUM of orders.commission_amount for the period. DISPLAY ONLY. Passing a
   *  wrong value here cannot affect netRevenue — that is the point. */
  commissionTotalInformational: number;
}

export interface NetRevenueResult {
  totalRevenue: number;
  expensesTotal: number;
  /** Passed straight through from the input. Never an operand. */
  commissionTotal: number;
  /** THE formula. One subtraction, one place, whole codebase. */
  netRevenue: number;
}

export function computeNetRevenue(input: NetRevenueInput): NetRevenueResult {
  return {
    totalRevenue: input.totalRevenue,
    expensesTotal: input.expensesTotal,
    commissionTotal: input.commissionTotalInformational,
    netRevenue: input.totalRevenue - input.expensesTotal,
  };
}
```

### `lib/types/index.ts` — additions (PR4)

Placed beside `ExternalIncome` (`:345-355`), whose shape it mirrors.

```ts
export type ExpenseCategory =
  | "supplies"
  | "services"
  | "salaries"
  | "rent"
  | "other";

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  /**
   * Set together with `quantity` or not at all — enforced by
   * scripts/045-expenses.sql's expenses_supply_bump_pairing CHECK, not just
   * by the form. When both are present, creating/deleting this expense
   * increments/decrements supplies.stock_quantity via the
   * expense_stock_movements ledger (scripts/046, PR5).
   */
  supply_id: string | null;
  quantity: number | null;
  created_at: string;
}
```

### `lib/hooks/expenses/use-expenses.ts` — query keys & invalidation (PR4/PR5)

```ts
function expensesQueryKey(startDate: string, endDate: string) {
  return ["expenses", startDate, endDate];
}

/**
 * Invalidation companion, mirroring use-supplies-crud.ts's
 * invalidateSupplyQueries and use-order-stock-sync.ts's
 * invalidateOrderStockQueries.
 *
 * DELIBERATE DIFFERENCE FROM use-external-income.ts:56-59, which invalidates
 * only its OWN exact date-range key: an expense written from the Gastos tab
 * (whose period filter is its own state) also changes the Resumen tab's
 * expensesTotal/netRevenue for a DIFFERENT range. Invalidating the
 * ["expenses"] PREFIX catches every mounted range. The narrower
 * external-income behaviour is a latent staleness bug we are not
 * reproducing; fixing external-income itself is out of scope here.
 *
 * `touchedStock` gates the supplies invalidations so a rent/salaries expense
 * doesn't pointlessly refetch the whole supplies list.
 *
 * ["revenue-by-source"] is deliberately NOT invalidated — expenses carry no
 * `source` and contribute nothing to that aggregation.
 */
function invalidateExpenseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  { touchedStock }: { touchedStock: boolean },
) {
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });

  if (touchedStock) {
    queryClient.invalidateQueries({ queryKey: ["supplies"] });
    queryClient.invalidateQueries({ queryKey: ["all-supplies"] });
    queryClient.invalidateQueries({ queryKey: ["expense-stock-movements"] });
  }
}
```

| Query key | Owner | Invalidated by |
|---|---|---|
| `["expenses", start, end]` | `useExpenses` | prefix `["expenses"]` on create/delete |
| `["expense-stock-movements", expenseId]` | (read-back, PR5 only if a UI needs it) | create/delete when `touchedStock` |
| `["orders-analytics", …]` | existing `useOrdersAnalytics` | expense create/delete (**new**), plus its existing external-income triggers |
| `["supplies"]`, `["all-supplies"]` | existing | expense create/delete when `touchedStock` |

### `lib/hooks/supplies/use-expense-stock-sync.ts` — new (PR5)

```ts
export async function applyExpenseStockBump(
  supabase: SupabaseClient,
  expenseId: string,
  supplyId: string,
  quantity: number,
): Promise<void>;

export async function reverseExpenseStockBump(
  supabase: SupabaseClient,
  expenseId: string,
): Promise<void>;

export function invalidateExpenseStockQueries(
  queryClient: QueryClient,
  expenseId: string,
): void;
```

---

## File Changes

### PR1 — /finanzas shell + Insumos tab + redirect (~250 lines)

| File | Action | Detail |
|---|---|---|
| `app/(dashboard)/finanzas/page.tsx` | Create | Server component: `<Header>` + `<Suspense fallback={…}><FinanzasTabs /></Suspense>`. The Suspense boundary is **required** — `FinanzasTabs` calls `useSearchParams`, which Next errors on during prerender without one. |
| `components/finanzas/finanzas-tabs.tsx` | Create | `"use client"`. Radix `Tabs` (already a dep: `@radix-ui/react-tabs` 1.1.2, and `components/ui/tabs` is used at `precios/page.tsx:440`). Reads `?tab=` via `useSearchParams`, writes via `router.replace(\`/finanzas?tab=${v}\`, { scroll: false })` — `replace`, never `push`, so tab-switching doesn't grow history. Unknown/absent `tab` falls back to `"resumen"`. Only the Insumos tab has content in PR1; the other three render a "próximamente" placeholder. |
| `components/finanzas/insumos-tab.tsx` | Create | Body of `app/(dashboard)/insumos/page.tsx:38-135` **minus** the `<Header>` (`:77`) and minus the outer `flex h-screen flex-col` wrapper (the shell owns both). Reuses `components/supplies/{supply-list,supply-form-dialog,low-stock-banner}.tsx` unchanged and the same four hooks (`:39-47`). |
| `app/(dashboard)/insumos/page.tsx` | Replace | Whole file (137 lines) → ~10-line server component: `import { redirect } from "next/navigation"; export default function InsumosPage() { redirect("/finanzas?tab=insumos"); }` + a doc comment citing D3. |
| `lib/service-nav-map.ts` | Modify | `:10` → `stock_management: ["/finanzas", "/insumos"]`; update the `:7-9` comment. |
| `components/layout/sidebar.tsx` | Modify | `:62` `{ name: "Insumos", href: "/insumos", icon: Package }` → `{ name: "Finanzas", href: "/finanzas", icon: Wallet }`; add `Wallet` to the `lucide-react` import (`:5-17`), drop `Package` if now unused. Update the `:59-61` gating comment. |

### PR2 — `computeMakeableCount` + test harness (~300 lines, logic-only)

| File | Action | Detail |
|---|---|---|
| `lib/services/recipe-cost.ts` | Modify | Append `QUANTITY_EPSILON`, `MakeableCountResult`, `computeLineMakeable`, `computeMakeableCount` after `computeMargin` (`:148`). Also update the `:7-8` doc comment's `components/precios/recipe-editor.tsx` path if PR3's move lands first (it does not — PR2 precedes PR3, so PR3 owns that fix). |
| `lib/services/recipe-cost.test.ts` | Create | See Testing Strategy. |
| `package.json` | Modify | `+ "test": "vitest run"` in `scripts` (`:5-10`); `+ "vitest"` in `devDependencies` (`:71-80`). |
| `vitest.config.ts` | Create | Minimal: `test.environment: "node"`, `resolve.alias` for `@/` (needed for the `@/lib/types` import at `recipe-cost.ts:1`). |

### PR3 — Recetas tab (~400 lines, highest UI risk)

| File | Action | Detail |
|---|---|---|
| `components/precios/recipe-editor.tsx` | **Move** | `git mv` → `components/finanzas/recipe-editor.tsx`. Body unchanged (verified no `/precios` coupling). |
| `components/finanzas/recetas-tab.tsx` | Create | Consolidated searchable table: one row per burger with name / cost / price / margin% / makeable count / limiting supply / "Receta incompleta" badge, plus an expand-to-edit row mounting `<RecipeEditor productId={…} />`. **Must port `precios/page.tsx:129-156` verbatim**, including the `if (!allSupplies) return map;` cold-load guard (`:136`) and the `freshLines` supply-override (`:147-150`) — see Verification Basis. Calls `computeProductCost` + `computeMargin` + `computeMakeableCount` on the same `freshLines`. |
| `components/finanzas/recipe-margin-chart.tsx` | Create | Recharts `BarChart` of margin% by product. `recharts` 2.15.4 + `components/ui/chart`'s `ChartContainer`/`ChartTooltip` are already in use at `rendimiento/page.tsx:43-56` — same wrappers, no new deps. |
| `components/finanzas/finanzas-tabs.tsx` | Modify | Replace the Recetas placeholder with `<RecetasTab />`. |
| `app/(dashboard)/precios/page.tsx` | Modify | Remove: `RecipeEditor` import (`:17`), `computeProductCost`/`computeMargin` import (`:16`), `useAllSupplies`/`useProductSuppliesBulk` imports (`:14-15`), `burgerIds`/`supplyById`/`costByProduct` memos (`:119-156`), the inline cost/margin IIFE (`:476-494`), and the `RecipeEditor` mount block (`:573-578`). **Keep**: `BurgerVariantsPreview` and its expand toggle (`:53-98`, `:544-572`), delivery-fee config (`:158-172`, `:270-329`), order-source/commission config (`:174-229`, `:331-438`), and all price editing. Also drop the now-unused `ProductSupplyWithSupply`/`Supply` type imports (`:19`). |
| `lib/services/recipe-cost.ts` | Modify | Doc comment `:7-8`: `components/precios/recipe-editor.tsx` → `components/finanzas/recipe-editor.tsx`; `app/(dashboard)/precios/page.tsx` → `components/finanzas/recetas-tab.tsx`. |
| `scripts/042-product-supplies.sql` | Modify | Prose comment `:12` path fix. Comment-only, no DDL change — see D7's caveat. |

### PR4 — expenses + Gastos tab, no stock bump (~350 lines)

| File | Action | Detail |
|---|---|---|
| `scripts/045-expenses.sql` | Create | See Migrations. |
| `lib/types/index.ts` | Modify | Add `ExpenseCategory` + `Expense` beside `ExternalIncome` (`:345-355`). |
| `lib/hooks/expenses/use-expenses.ts` | Create | `useExpenses` / `useCreateExpense` / `useDeleteExpense` + `expensesQueryKey` + `invalidateExpenseQueries`. Modelled on `use-external-income.ts:1-82`. In PR4 every call passes `touchedStock: false`. |
| `components/finanzas/gastos-tab.tsx` | Create | Period filter + total + list + "Nuevo gasto" button + delete confirm (`AlertDialog`, same pattern as `insumos/page.tsx:118-133`). |
| `components/finanzas/expense-form-dialog.tsx` | Create | date / amount / category `Select` (5 fixed options) / description / optional supply `Select` + quantity. Client-side pairing guard mirroring the DB CHECK: enabling the supply field requires both fields. In PR4 the supply/quantity fields are captured and persisted but produce no stock effect — matching 043's `price_adjustment` precedent. |
| `components/finanzas/expense-list.tsx` | Create | Category badge + amount + date + description + delete. |
| `components/finanzas/finanzas-tabs.tsx` | Modify | Replace the Gastos placeholder with `<GastosTab />`. |

### PR5 — ledger + stock bump (~300 lines, depends on PR4)

| File | Action | Detail |
|---|---|---|
| `scripts/046-expense-stock-movements.sql` | Create | See Migrations. |
| `lib/hooks/supplies/use-expense-stock-sync.ts` | Create | `applyExpenseStockBump` / `reverseExpenseStockBump` / `invalidateExpenseStockQueries`. Header must carry D2's four-case ordering table verbatim. |
| `lib/hooks/expenses/use-expenses.ts` | Modify | `useCreateExpense`: after the INSERT, if `supply_id && quantity`, call `applyExpenseStockBump`; on failure surface the "adjust manually" message, never a retry. `useDeleteExpense`: reverse → delete ledger → delete expense (D2's three-step ordering). Both pass `touchedStock: Boolean(supply_id && quantity)`. |
| `components/finanzas/expense-form-dialog.tsx` | Modify | Add the "esto sumará N {unit} al stock de {supply}" preview line; remove the PR4 "no aplica stock todavía" note. |
| `components/finanzas/gastos-tab.tsx` | Modify | Render the partial-failure banner state. |

### PR6 — analytics extension + Resumen tab (~350 lines, depends on PR4)

| File | Action | Detail |
|---|---|---|
| `lib/services/finance-summary.ts` | Create | See Interfaces. |
| `lib/hooks/orders/use-orders-history.ts` | Modify | `useOrdersAnalytics`: add `commission_amount` to the current-period `orders` select (`:159-164`); add two `expenses` queries to the `Promise.all` (`:158-193`) using the existing `startDateStr`/`endDateStr`/`prevStartDateStr`/`prevEndDateStr` strings computed at `:146-149` — same DATE-column treatment `external_income` already gets at `:183-192`; add `e7`/`e8` throws after `:200`; compute `expensesTotal`, `commissionTotal`, `prevExpensesTotal`; call `computeNetRevenue` once; spread its result plus `expensesChange`/`netRevenueChange` (via the existing `pct` helper at `:231-232`) into the return object (`:271-283`). No signature change — `/rendimiento` keeps working and simply gains the fields. |
| `components/finanzas/resumen-tab.tsx` | Create | Stat cards: Ingresos / Gastos / **Neto** / (informational) Comisiones. Reads `analytics.netRevenue` — **performs no arithmetic**. Plus expenses-by-category breakdown. |
| `components/finanzas/finanzas-tabs.tsx` | Modify | Replace the Resumen placeholder with `{activeTab === "resumen" && <ResumenTab />}` inside `<TabsContent value="resumen">` (D9). Never add `forceMount`. |

**Totals**: 16 created, 12 modified, 1 moved, 0 deleted (`insumos/page.tsx` is replaced, not removed — the route must keep existing to redirect).

---

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (PR2) | `computeLineMakeable` | vitest. Cases: normal division; exact division; `effectiveQuantity === 0` → `null`; `effectiveQuantity === 1e-12` → `null` (epsilon); float-dust quantity → `null`, not a huge number; **negative `stockQuantity` → 0, not negative**. |
| Unit (PR2) | `computeMakeableCount` | vitest. Cases: MIN picked correctly across 3 lines + `limitingSupplyId` identifies it; empty recipe → `{ count: null }` (**not 0**); all-lines-zero-quantity → `{ count: null }`; **inactive supply line INCLUDED in the MIN** (regression guard for the confirmed rule); missing supply → `count: 0` + `incomplete: true`; `variantFactors` scaling changes the answer and matches `computeProductCost`'s `effectiveQuantity` for the same input (drift guard on the shared `resolveRecipeQuantities`). |
| Unit (PR6) | `computeNetRevenue` | vitest. The one test that matters: with `totalRevenue: 1000, expensesTotal: 300, commissionTotalInformational: 150` → `netRevenue === 700`, **not 550**. Plus: changing only `commissionTotalInformational` leaves `netRevenue` unchanged. |
| Types | Whole chain | `npx tsc --noEmit` in **every** PR. `next.config.mjs:3-5` sets `ignoreBuildErrors: true`, so a green `next build` proves nothing. |
| Lint | Whole chain | `pnpm lint` (`package.json:8`). |
| Manual — gating (PR1) | Service off | With `stock_management` inactive: `/finanzas`, `/finanzas?tab=insumos`, and `/insumos` all redirect to `/plan`; the Finanzas sidebar item is hidden. With it active: all reachable, item visible. |
| Manual — redirect (PR1) | `/insumos` | Lands on `/finanzas?tab=insumos` with the Insumos tab pre-selected, no visible flash, back button returns to the previous page (not into a redirect loop). |
| Manual — deep link (PR1) | `?tab=` | `?tab=gastos` opens Gastos; `?tab=bogus` falls back to Resumen; switching tabs 5× then pressing Back once leaves `/finanzas` entirely (proves `replace`, not `push`). |
| Manual — regression (PR3) | `/precios` | Delivery fee edit, order-source add/edit/delete, burger price edit, extras/drinks/fries price edits, variant preview expand — all still work; cost/margin text and the recipe editor are gone. |
| Manual — stale-join (PR3) | Recetas tab | Edit a supply's `cost_per_unit` in the Insumos tab → the Recetas tab's cost updates without a hard reload (proves the `freshLines` override was ported). Cold-load the Recetas tab → no "Receta incompleta" flash on a complete recipe (proves the `!allSupplies` guard was ported). |
| Manual — idempotency (PR5) | Double-submit | Double-click "Guardar" on a supplies expense → **exactly one** ledger row, stock incremented **once**. Then delete the expense → stock returns to its original value, ledger row and expense row both gone. |
| Manual — reversal floor (PR5) | Below zero | Set a supply's stock to 2, create an expense bumping +10 (stock 12), manually adjust stock to 1, delete the expense → stock lands at **−9**, not 0. |
| Manual — partial failure (PR5) | Simulated | Temporarily point `applyExpenseStockBump`'s UPDATE at a bad column → the expense row still exists, the "ajustalo manualmente" message shows, and **no retry button is offered**. |
| Manual — double-subtraction (PR6) | The headline check | Create an order through a channel with a 10% commission (say items 1000 ⇒ `total_amount` 900, `commission_amount` 100), complete it, add a 200 expense. Resumen must show Ingresos 900 / Gastos 200 / **Neto 700** / Comisiones 100. **Neto 600 means the bug shipped.** |
| Manual — query firing (PR6) | Tab isolation | Open `/finanzas?tab=insumos` with the Network tab open → **zero** `expenses`/`orders` analytics requests until the Resumen tab is selected. |

No E2E layer — this repo has no browser-test infrastructure and introducing Playwright is well outside this change's scope.

---

## Migration / Rollout

Six sequential PRs, each independently revertible. Migrations are strictly additive (two `CREATE TABLE`s, zero `ALTER`s to existing tables), so a code revert never leaves an inconsistent schema — an orphaned unused table is harmless.

Ordering constraints: **PR5 requires PR4** (needs the `expenses` table). **PR6 requires PR4** (needs `expenses` to aggregate). **PR5 and PR6 are independent of each other** and may land in either order. PR2 must precede PR3 (`computeMakeableCount` is what the Recetas table renders). PR1 must be first (creates the shell every later tab mounts into).

Chain strategy is the orchestrator's call, but note PR3's touch-set overlaps nothing in PR4/PR5/PR6, so a `feature-branch-chain` keeps each child diff clean.

Apply `045` before deploying PR4's code and `046` before PR5's, per this repo's standing "apply to a throwaway/dev clone first" caveat — **neither script has been run against any live database.**

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Double-subtraction of commission** ships despite D5 | High | Single-function boundary (D5's three properties) + the dedicated unit test + the explicit manual arithmetic check in the Testing Strategy. |
| Recetas tab drops the `freshLines`/cold-load guards when porting `precios/page.tsx:129-156` | High | Called out in Verification Basis, in the PR3 file table, and with two dedicated manual QA rows. This is the single most likely PR3 regression. |
| `next.config.mjs`'s `ignoreBuildErrors: true` hides type breakage from the `/precios` removals | Medium | Mandatory `npx tsc --noEmit` per PR. |
| Partial stock bump (expense committed, stock not) leaves silent drift | Medium | Accepted, by design — no transaction is available (documented at `use-order-stock-sync.ts:55-62`). D2's ordering guarantees the drift direction is always under-count; the "adjust manually" UX makes it visible; the Insumos tab is the recovery path. |
| Someone later adds `forceMount` to `TabsContent` for an animation, silently re-enabling the analytics query on every load | Low | D9's explicit `activeTab === "resumen" &&` guard makes the behaviour independent of the Radix prop. |
| Two near-identical ledgers drift apart over time (D1's accepted cost) | Low | Both files' headers cross-reference each other and share D2's single ordering invariant, stated verbatim in both. |
| The `expenses` → `expense_stock_movements` CASCADE erases a ledger row before its stock is reversed | Medium | D2's explicit three-step delete ordering, documented in `046`'s header and in `use-expenses.ts`. Worth a dedicated review comment in PR5. |
| PR3 exceeds the 400-line review budget | Medium | Estimated ~400 with the `git mv` counted as a rename (near-zero effective lines). If it overruns, the margin chart (`recipe-margin-chart.tsx`) splits cleanly into a PR3b — it has no dependency on the table beyond the same derived data. |

## Open Questions

- [ ] **D8 (vitest) is a scope addition beyond the proposal's PR2 estimate.** Confirm before apply: land the harness in PR2 (~+40 lines config/deps), or drop "+ tests" and ship `computeMakeableCount` with a documented manual-verification matrix instead?
- [ ] **D7's `scripts/042-product-supplies.sql:12` comment edit.** Migration files are conventionally append-only. Editing a prose comment changes no DDL, but if the team treats applied migrations as byte-frozen, the path-rename note belongs in `046`'s header instead. Low stakes, needs a one-word answer.
