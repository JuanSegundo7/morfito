# Proposal: `finanzas-gastos-recetas` — Consolidated `/finanzas` (Resumen · Gastos · Insumos · Recetas)

## Intent

The just-merged `porting-cost-stock-finance` chain gave morfito supplies, stock, recipes, per-source commission and revenue-by-source — but left the operator's money picture **incomplete and scattered**:

- **No expenses concept at all.** Repo-wide search for `expense|gasto|purchase|compra` returns 2 false positives. The operator can see what came in, never what went out. "Did I make money this month?" is unanswerable inside morfito.
- **Restocking is invisible.** `useAdjustSupplyStock` (`lib/hooks/supplies/use-supplies-crud.ts:148-178`) is a full-value replace with no cost and no ledger — a restock and a stocktake correction are indistinguishable after the fact.
- **Cost/recipe UX is buried.** `app/(dashboard)/precios/page.tsx` computes cost/margin per burger (`costByProduct`, line 129-152) and mounts `RecipeEditor` (line 577) only inside an expanded burger row. There is **no consolidated cross-product view** — no way to answer "which product has the worst margin" or "how many of X can I still make" without expanding rows one at a time.
- **Financial surfaces are split across routes.** `/insumos` (stock), `/precios` (recipes + margin), `/rendimiento` (revenue) — three routes, one mental model.

This change creates `/finanzas` as the single operational-finance surface: **Resumen · Gastos · Insumos · Recetas**.

## Scope (staged work units)

**Unit 1 — `/finanzas` shell + Insumos tab + route migration**
New `app/(dashboard)/finanzas/page.tsx` with 4 tabs, URL-synced via `?tab=` using `router.replace` (no history growth). `app/(dashboard)/insumos/page.tsx` content (`LowStockBanner`, combo-lines-not-counted banner, `SupplyList`, `SupplyFormDialog`, delete `AlertDialog`) moves wholesale into the Insumos tab. `/insumos` becomes a redirect to `/finanzas?tab=insumos`. `SERVICE_NAV_HREFS.stock_management` (`lib/service-nav-map.ts:10`) changes from `["/insumos"]` to `["/finanzas", "/insumos"]`; sidebar item relabels to `/finanzas`.

**Unit 2 — Recetas tab + makeable count**
Cost/margin block and `RecipeEditor` move out of `/precios` into the Recetas tab. Add `computeMakeableCount` to `lib/services/recipe-cost.ts`, reusing the **same resolved-quantity array** `computeProductCost` already builds via `resolveRecipeQuantities` (line 71). Recetas gains the consolidated UX `/precios` never had: a single searchable table across products showing cost / price / margin % / makeable count / limiting supply, plus a margin comparison chart.

**Unit 3 — Expenses schema + one-off Gastos (no stock bump)**
Migration `045`: `expenses` table. Hooks `useExpenses` / `useCreateExpense` / `useDeleteExpense`. Gastos tab period view: date-ranged list, totals by category, create dialog, delete with confirm.

**Unit 4 — Ledger-backed expense→stock bump**
Migration `046`: idempotency ledger. Expense dialog gains optional supply + quantity; saving an expense with both bumps `supplies.stock_quantity` through the ledger.

**Unit 5 — Resumen tab**
Extend `useOrdersAnalytics` with `expensesTotal`, `commissionTotal`, `netRevenue`. Render summary row, expenses-by-category chart, daily income-vs-expenses chart, net revenue card.

## Out of Scope (non-goals, with reasons)

| Non-goal | Why |
|---|---|
| **Recurring expenses** (`recurring_expenses`, "Fijos mensuales" sub-tab, proration math) | Deferred by product decision. jebbs needed 3 migrations (`005`, `006`) to get the model right, and proration touches the analytics period math. Ship one-off entries first, validate the category model, then add templates as a follow-up change. |
| **Expense editing/update** | Mirrors jebbs deliberately: `jebbs-dashboard/lib/hooks/use-expenses.ts` exposes only `useExpenses` (64), `useCreateExpense` (83), `useDeleteExpense` (152) — **verified, there is no update hook**. Delete-and-recreate is correct for a ledger-adjacent record: an in-place amount edit would desync an already-applied stock bump. |
| **Per-tab service gating** | No tab-level gating precedent exists in morfito. Whole-page gate reuses the existing two-layer mechanism (`middleware.ts:97-102` + `sidebar.tsx` `isNavItemVisible`) with zero new concepts. |
| **Multi-warehouse, supplier management, purchase orders** | Same non-goals as the prior change; still out. An expense with an optional supply link is not a procurement system. |
| **Direct API / webhook / delivery-platform integrations** | Orders and expenses stay manually entered by staff. |
| **Cost/margin UI for extras, drinks, fries, combos in `/precios`** | Those tabs keep price-only editing. Recipe/cost UX now lives in `/finanzas`, so `/precios` does not grow. |

`/precios` retains: default delivery fee config, order-source + commission config, all price-editing UI across all 5 tabs.

## Capabilities (contract with `sdd-spec`)

### New capabilities
- `expense-tracking`: one-off expense records (date, amount, 5-value category, description), list/create/delete, date-ranged aggregation by category.
- `expense-stock-sync`: idempotent, ledger-backed stock increment/decrement driven by an expense's optional supply + quantity pair.
- `recipe-makeable-count`: per-product makeable-unit calculation with limiting-supply identification, derived from the same resolved recipe quantities as cost.
- `finance-overview`: consolidated `/finanzas` surface — tab shell, URL sync, whole-page service gating, and the Resumen net-revenue view.

### Modified capabilities
- `revenue-analytics` (`useOrdersAnalytics`): gains `expensesTotal`, `commissionTotal`, `netRevenue`, and expenses folded into `dailyData`. **Requirement change**: `netRevenue` must not subtract commission from an already-net `total_amount`.
- `supplies-management`: unchanged behavior, relocated mount point (`/insumos` → `/finanzas?tab=insumos`) plus the redirect requirement.
- `pricing-configuration` (`/precios`): **requirement narrowed** — no longer owns cost/margin display or recipe editing.
- `service-gating` (`lib/service-nav-map.ts` + `middleware.ts`): `stock_management` now gates `/finanzas` and `/insumos`.

## Key business rules

1. **`netRevenue = totalRevenue − expensesTotal`. Commission is NOT subtracted again.** — see Convention Correction below. This is the single highest-stakes rule in the change.
2. **Expense→stock bump only fires when BOTH `supply_id` and a resolved `quantity` are present.** Supply linkage is optional even for `category = 'supplies'` — a "$40.000 meat purchase" with no supply picked is still a valid expense. *Why*: forcing linkage would make operators skip logging expenses entirely when the mapping is ambiguous, which is worse than an unlinked expense.
3. **Stock bump is idempotent via ledger, never bare read-then-write.** Pre-check the ledger before mutating; treat a `23505` unique violation on insert as already-applied; order writes to bias toward under-counting on crash. *Why*: jebbs' `useCreateExpense` (`use-expenses.ts:111-125`) does a bare read-then-write with no guard — a retried create double-bumps stock. morfito already solved this in `syncOrderStockForTransition` (`lib/hooks/supplies/use-order-stock-sync.ts`, backed by `scripts/044-order-stock-movements.sql`'s `UNIQUE (order_id, supply_id)`).
4. **Stock reversal on expense delete does not floor at zero.** *Why*: negative stock is legal in morfito and signals a real data problem the operator should see, not silently absorb.
5. **A failed stock bump after a committed expense must not tell the user to retry.** There is no transaction. The UI must say "expense saved, adjust stock manually" — retry would duplicate the expense.
6. **`computeMakeableCount` excludes lines with `quantity <= 0` from the MIN (returns `null`, not `0`) and includes inactive supplies.** Uses a `1e-9` epsilon before flooring. *Why*: a zero-quantity line is a data artifact, not a hard constraint; counting it as `0` would report every product as unmakeable. Including inactive supply lines under-reports, which is the safe error direction. Float division like `3 / 0.3` yields `9.999...` and would floor to `9` without the epsilon.
7. **Makeable count and cost must derive from the same resolved quantities.** Both consume the output of `resolveRecipeQuantities`. *Why*: re-deriving fixed↔scaled resolution independently lets cost and makeable count drift apart on variant-scaled recipe lines.
8. **Expense categories are exactly 5: `supplies | services | salaries | rent | other`.** DB-level `CHECK`, no extension in this change.
9. **`/finanzas` is entirely gated behind `stock_management`.** All four tabs, one gate.

## Convention correction vs. the source project (IMPORTANT — needs user acknowledgment)

**Confirmed decision 6 said: `netRevenue = totalRevenue − expensesTotal − commissionTotal`, using morfito's own per-source commission. The "don't copy jebbs' hardcoded pedidosya bucket" half is correct and stands. The subtraction half is arithmetically wrong for morfito and would understate profit.**

Verified evidence:

- **jebbs stores GROSS totals.** `jebbs-dashboard/lib/hooks/orders/use-create-order.ts:102` writes `total_amount: total` with `commissionAmount` stored *separately* on the row. jebbs' own comment (`use-orders-history.ts:180-183`): *"an order, whose total_amount is gross and whose commission is frozen on the row separately."* So jebbs' `netRevenue = currentRevenue - expensesTotal - commissionTotal` (line 564) subtracts commission **once**.
- **morfito stores NET totals.** `lib/hooks/orders/use-create-order.ts:104` → `itemsTotal + priceAdjustment - discountAmount - commissionAmount + delivery_fee`, and `use-update-order.ts:112-117` does the identical math. `useOrdersAnalytics` sums `total_amount` into `totalRevenue` (`use-orders-history.ts:207-210, 274`).
- **Therefore commission is already netted out of morfito's `totalRevenue`.** Subtracting `SUM(orders.commission_amount)` again double-counts it.

**Recommendation:** `netRevenue = totalRevenue − expensesTotal`. Still compute `commissionTotal = SUM(orders.commission_amount)` over the same date range and **display it as an informational line item** ("Comisiones de canales: −$X, ya descontadas de la facturación") so the operator sees channel cost without it hitting the bottom line twice. Same information, correct arithmetic. `sdd-spec` should encode this with an explicit test.

*Second correction:* jebbs assembles a dedicated `analytics.ledger` array (`use-orders-history.ts:634-712`) for `DailyLedger`. morfito **already has** `dailyData` (`use-orders-history.ts:256-269`) with per-day revenue including external income and gap-filled days. Join expenses grouped by `expenses.date` onto that existing array instead of porting a second parallel daily structure.

## Approach

**Data model sketch** (full DDL is `sdd-design`'s job; next free migration number is **045** — verified, `scripts/044-order-stock-movements.sql` is the last):

`045-expenses.sql`
- `expenses`: `id uuid pk`, `date date not null`, `amount decimal(10,2) not null`, `category text not null CHECK (category IN ('supplies','services','salaries','rent','other'))`, `description text`, `supply_id uuid null REFERENCES supplies(id)`, `quantity decimal null`, `created_at timestamptz default now()`.
- jebbs reached this shape across `003` + `008`; morfito lands it in one migration since there is nothing to migrate.
- Index on `date` (every read is date-ranged). RLS enabled + allow-all policy, matching `044`.

`046-expense-stock-movements.sql` — two candidate shapes, **`sdd-design` decides**:
- **(A) New table `expense_stock_movements`** with `UNIQUE (expense_id, supply_id)`. Pro: mirrors `044` exactly, zero risk to the shipped order-stock path, independent rollback. Con: two near-identical ledgers.
- **(B) Extend `order_stock_movements`** with nullable `expense_id`, relax `order_id` to nullable, add partial unique indexes per source. Pro: one ledger, one "stock movement history" query. Con: touches a table the just-merged PR4/PR5 depend on, and the existing `UNIQUE (order_id, supply_id)` constraint must be reworked — real regression risk on shipped behavior.
- **Leaning (A)** on the strength of "don't destabilize a two-week-old shipped ledger to save a table," but the reconciliation value of (B) is real. `sdd-design` owns this.

Migration conventions follow the house style already used by `041`-`044` and jebbs: `information_schema` pre-flight comments, `BEGIN`/`COMMIT`, plain `ADD COLUMN` (never `IF NOT EXISTS`), documented undo block, no CHECK beyond simple enums.

**Service layer**
- `lib/services/recipe-cost.ts` gains `computeLineMakeable(quantity, stockQuantity)` and `computeMakeableCount(...)` returning `{ count, limitingSupplyId }`, consuming the array `resolveRecipeQuantities` already produces. Pure functions, directly unit-testable — Strict TDD applies.
- `lib/hooks/expenses/use-expenses.ts` (new): list/create/delete, React Query with date-range keys.
- Stock-bump logic lives in its own module mirroring `use-order-stock-sync.ts`'s structure, **not** inlined in the mutation.
- `useOrdersAnalytics` extended with `expensesTotal`, `commissionTotal`, `netRevenue`, and expenses folded into `dailyData`. Expense queries fire only when the Resumen tab is active.
- `useRevenueBySource`'s explicit unknown-bucket aggregation pattern (`use-orders-history.ts:558-660`) is the template for expenses-by-category.

**Gating detail (resolved with evidence, for `sdd-design` to implement)**
`middleware.ts:39-42` matches `pathname === href || pathname.startsWith(href + "/")`. If only `/finanzas` is listed, a gated user hitting `/insumos` gets redirected to `/finanzas?tab=insumos` and *then* bounced to `/plan` — two hops, and the sidebar-hide logic would leave `/insumos` visible. **List both**: `stock_management: ["/finanzas", "/insumos"]`. `/plan` stays never-gated (`NEVER_GATED_PATHS`, line 31).

## UI touch points

| Path | Impact | What changes |
|---|---|---|
| `app/(dashboard)/finanzas/page.tsx` | New | 4-tab shell, `?tab=` URL sync |
| `app/(dashboard)/insumos/page.tsx` | Replaced | Becomes a redirect to `/finanzas?tab=insumos` |
| `app/(dashboard)/precios/page.tsx` | Modified | Removes `costByProduct` memo (129-156), inline cost/margin (476-494), `RecipeEditor` mount (570-580) and its imports (16-17). Keeps delivery-fee + commission config and all price editing. |
| `components/precios/recipe-editor.tsx` | Moved | → `components/finanzas/` (or `components/recetas/`); component body unchanged |
| `components/supplies/*` | Reused | `SupplyList`, `SupplyFormDialog`, `LowStockBanner` unchanged, new mount point |
| `components/finanzas/*` | New | Gastos list + dialog, Recetas table + margin chart, Resumen cards/charts |
| `lib/services/recipe-cost.ts` | Modified | `computeMakeableCount` added |
| `lib/hooks/expenses/*` | New | Expenses CRUD + stock-bump sync |
| `lib/hooks/orders/use-orders-history.ts` | Modified | Analytics extended |
| `lib/service-nav-map.ts`, `components/layout/sidebar.tsx` | Modified | Gate + nav label |
| `lib/types/index.ts` | Modified | `Expense`, `ExpenseCategory`, makeable-count result types |
| `scripts/045-*.sql`, `scripts/046-*.sql` | New | Schema |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Net-revenue double-subtraction of commission** | High if jebbs' formula is copied verbatim | High — every profit number wrong | Convention correction above; explicit spec requirement + test asserting commission is not subtracted from a net `total_amount` |
| Expense committed, stock bump fails (no transaction) | Medium | Medium | Ledger pre-check + `23505` swallow; UI says "adjust manually", never "retry" |
| Option (B) ledger extension regresses shipped order-stock sync | Medium if (B) chosen | High | Prefer (A); if (B), require regression tests over `syncOrderStockForTransition` before merge |
| `/precios` extraction breaks price editing | Medium | Medium | Unit 2 is a pure move — no logic edits in the same PR |
| Bookmarks / muscle memory on `/insumos` | High | Low | Redirect, not retire (confirmed decision 4) |
| Makeable count wrong on variant-scaled recipes | Medium | Medium | Rule 7: single resolved-quantity source; TDD covering fixed, scaled, zero-quantity, inactive-supply and float-precision cases |
| Recetas consolidated table N+1 on recipe lines | Medium | Medium | Batch-fetch all recipe lines once, compute client-side — same shape as today's `costByProduct` memo |
| Resumen tab query cost | Low | Low | Fetch analytics only when `tab === "resumen"` (jebbs' own pattern) |
| Scope creep — 5 units is a lot | High | Medium | Staged PRs below; each independently shippable |

## Rollback plan

- **Units 1-2 (UI only):** revert the commits. `/precios` regains cost/margin + `RecipeEditor`; `/insumos` reverts from redirect to real page; `service-nav-map.ts` reverts to `["/insumos"]`. No data involved.
- **Unit 3:** revert code, then `DROP TABLE expenses;` (documented undo block in `045`). Nothing else references it.
- **Unit 4:** revert code, then drop the ledger (option A) or drop the added column + restore the original unique constraint (option B — write the undo before writing the migration). Already-applied stock bumps stay applied; the ledger drop only removes idempotency history, so **re-applying Unit 4 after a rollback could re-bump previously bumped stock** — call this out in the migration's undo notes.
- **Unit 5:** revert code. Read-only aggregation, no schema.
- Migrations are additive throughout; no existing table is altered under option (A).

## Dependencies

- `porting-cost-stock-finance` merged to master (supplies, `product_supplies`, `resolveRecipeQuantities`, `order_stock_movements`, `orders.commission_amount`). **Satisfied.**
- Migration numbers `045`+ free. **Verified.**
- Supabase migrations applied to the target environment before the dependent PR merges.
- Entitlements/control-panel `stock_management` service key already exists. **Satisfied.**
- No new npm dependencies expected (charts reuse the existing charting stack in `components/analytics/`).

## Suggested staging

| PR | Unit | Content | Est. lines | Notes |
|---|---|---|---|---|
| **1** | Unit 1 | `/finanzas` shell + `?tab=` sync + Insumos tab + `/insumos` redirect + gate flip + sidebar | ~250 | Pure move + routing. Ships alone, immediately visible, trivially revertible. |
| **2** | Unit 2a | `computeMakeableCount` in `recipe-cost.ts` + tests | ~150 | **Logic-only, no UI.** Strict TDD. Deliberately separated so the math gets a focused review. |
| **3** | Unit 2b | Recetas tab: move cost/margin + `RecipeEditor` out of `/precios`, consolidated table + margin chart | ~400 | Highest UI risk. Consumes PR 2's function. |
| **4** | Unit 3 | `045-expenses.sql` + expenses hooks + Gastos tab (create/list/delete, **no** stock bump) | ~350 | Fully usable expense tracking on its own. |
| **5** | Unit 4 | `046` ledger + supply/quantity in expense dialog + idempotent bump/reverse | ~300 | Depends on PR 4. Riskiest data path — isolated on purpose. |
| **6** | Unit 5 | Analytics extension + Resumen tab | ~350 | Depends on PR 4 (expenses exist). Encodes the net-revenue correction. |

Rationale for splitting Unit 2 across PRs 2-3: makeable-count is pure arithmetic with subtle edge cases (epsilon, `null` vs `0`, inactive supplies) that deserve review attention a 400-line UI diff would drown. Rationale for splitting Units 3/4: expense tracking has standalone value, and the stock-bump ledger is the one place a bug silently corrupts inventory data — it gets its own reviewable boundary.

Each PR: independently shippable, independently revertible, under the 400-line review budget. `sdd-tasks` should confirm the forecast.

## Success criteria

- [ ] `/finanzas` renders 4 tabs; `?tab=` deep-links work and use `router.replace` (no history growth)
- [ ] `/insumos` redirects to `/finanzas?tab=insumos`; existing bookmarks resolve
- [ ] A user without `stock_management` hitting `/finanzas` **or** `/insumos` lands on `/plan`; neither appears in the sidebar; `/plan` stays reachable
- [ ] `/precios` still edits prices across all 5 tabs and still owns delivery-fee + commission config, with no cost/margin/recipe UI remaining
- [ ] Recetas tab lists all recipe-bearing products in one searchable table with cost, price, margin %, makeable count and limiting supply; recipe editing still works end to end
- [ ] `computeMakeableCount` returns `null` (not `0`) for `quantity <= 0` lines, includes inactive supplies, floors with `1e-9` epsilon, and derives from the same `resolveRecipeQuantities` output as `computeProductCost` — all covered by tests
- [ ] An expense can be created with any of the 5 categories and deleted; DB rejects any other category
- [ ] Creating an expense with supply + quantity increments `supplies.stock_quantity` exactly once; a duplicate/retried submission does **not** double-bump (ledger-verified)
- [ ] Deleting that expense decrements stock exactly once and does not floor at zero
- [ ] A stock-bump failure after a committed expense surfaces "adjust stock manually", never "retry"
- [ ] Resumen shows `netRevenue = totalRevenue − expensesTotal`, with `commissionTotal` displayed as an informational already-deducted line — a test asserts commission is not subtracted twice
- [ ] Expenses-by-category and daily income-vs-expenses charts render, including empty and single-day periods
- [ ] `tsc --noEmit` clean under TS5 strict; no new lint errors

## Proposal question round — resolved

A product question round was run before this proposal. The following are **CONFIRMED**, not open:

1. **Recurring expenses** — CONFIRMED DEFERRED. First slice is one-off expenses only. `recurring_expenses`, the "Fijos mensuales" sub-tab and proration math are a follow-up change.
2. **Expense→stock bump** — CONFIRMED ledger-backed, mirroring `order_stock_movements` idempotency. Not jebbs' bare read-then-write. Exact table shape deferred to `sdd-design` (options A/B above).
3. **Gating** — CONFIRMED whole-page gate on `stock_management`, existing mechanism, no per-tab gating.
4. **`/insumos`** — CONFIRMED redirect to `/finanzas?tab=insumos`, not a hard retire.
5. **Expense categories** — CONFIRMED exactly `supplies | services | salaries | rent | other`, no extension.
6. **Net revenue** — CONFIRMED to use morfito's own per-source commission model rather than jebbs' hardcoded single-channel bucket. **⚠️ The arithmetic needs one correction the question round could not have anticipated**: morfito's `orders.total_amount` is already net of commission (`use-create-order.ts:104`, `use-update-order.ts:112-117`), unlike jebbs' gross totals. `netRevenue = totalRevenue − expensesTotal − commissionTotal` would subtract commission twice. See *Convention correction* above. **This is the one item that should be confirmed before `sdd-spec` runs.**

### Verification status of exploration claims

All claims load-bearing for this proposal were re-verified directly against the code in this session: migration numbering (`044` is last), `SERVICE_NAV_HREFS.stock_management`, middleware gating semantics, absence of `computeMakeableCount`, `/precios` cost/margin + `RecipeEditor` mount points, `/insumos` component tree, morfito analytics shape, morfito's net-of-commission order totals, jebbs' gross totals and `netRevenue` formula, and jebbs' expenses hooks exposing create/delete only (no update).

**Carried from explore, not re-verified in this session:** jebbs' `calculateLineMakeable`/`calculateMakeableCount` implementation details in `jebbs-dashboard/lib/utils/costing.ts:135-178`; jebbs' migration trail `003/005/006/008/009`; jebbs' expense-dialog UX at `finanzas/page.tsx:968-1026`; the internal line-by-line behavior of morfito's `syncOrderStockForTransition` (its backing `UNIQUE (order_id, supply_id)` constraint in `scripts/044` **was** verified). These are treated as reliable but should be re-read by `sdd-design` before implementing the ledger and the makeable-count math.
