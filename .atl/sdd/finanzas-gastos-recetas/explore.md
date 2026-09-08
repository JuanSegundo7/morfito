# Explore: finanzas-gastos-recetas

## 1. Current `/precios` (morfito, post-merge)

`app/(dashboard)/precios/page.tsx`:
- Single page, 5 tabs: Hamburguesas / Extras / Bebidas / Papas / Combos (lines 440-447).
- Top of page: "Configuración general" (default delivery fee, lines 270-329) and "Canales de venta y comisiones" (order sources + commission rates, lines 333-438) — both operator config cards, unrelated to pricing per-product, would stay in `/precios` under any reorg since jebbs' own `/precios` is separate from `/finanzas`.
- Per-burger cost/margin: computed once via `useMemo` (`costByProduct`, lines 129-156) using `computeProductCost`/`computeMargin` from `lib/services/recipe-cost.ts`, then rendered inline next to the price button (lines 476-494) — cost, margin%, and an "Receta incompleta" badge, all on ONE line per burger, only when expanded not required (cost line shows even collapsed).
- Recipe editing itself is NOT inline — `RecipeEditor` (`components/precios/recipe-editor.tsx`) mounts only when a burger row is expanded (`expandedBurgerId === burger.id`, page.tsx:570-580), i.e. one recipe editor per product, opened on demand, no consolidated table. This matches the explore brief's premise: no single searchable table with margin/makeable/limiting-supply, no `MarginByBurgerChart` equivalent.
- Extras/drinks/fries/combos tabs (page.tsx:589-680) show price only — no cost/margin/recipe UI at all for non-burger products, even though `RecipeEditor`/`recipe-cost.ts` are product-id-generic (`product_id` FK, not burger-specific) and could support it.
- `RecipeEditor` (`components/precios/recipe-editor.tsx`, 384 lines) is a full add/edit/remove recipe-line editor with fixed↔scaled toggle and quantity-conversion suggestions (lines 174-331) — functionally comparable to jebbs' `EditRecipeDialog`, but rendered inline in the page rather than as a modal.

**What would move if `/precios` → pure price editing (matching jebbs)**: the cost/margin computation block (page.tsx:113-156, 476-494), the `RecipeEditor` mount (570-580) and the component itself. What would stay: delivery fee config, order-source/commission config, and all price-editing UI (edit/save button flow, tabs).

## 2. Current `/insumos` (morfito, post-merge)

`app/(dashboard)/insumos/page.tsx` (137 lines):
- Gated by `stock_management` service key (comment lines 27-37, confirmed against `lib/service-nav-map.ts`).
- Uses `useAllSupplies` (includes inactive), `useDeleteSupply`/`useToggleSupplyActive` from `lib/hooks/supplies/use-supplies-crud.ts`, `useComboLinesNotCounted` (new PR5 diagnostic hook, `lib/hooks/supplies/use-combo-lines-not-counted.ts`).
- Renders: `LowStockBanner`, a combo-lines-not-counted amber banner (lines 89-96, only when `comboLinesNotCounted > 0`), `SupplyList` inside a `Card`, `SupplyFormDialog` (create/edit modal), a delete `AlertDialog`.
- Components at `components/supplies/{low-stock-banner,supply-form-dialog,supply-list}.tsx` (confirmed to exist via Glob, not deep-read — page-level composition is enough to know what moves).
- Title/subtitle are hardcoded ("Insumos" / "Gestioná el stock y costo de tus insumos"), not vertical-sourced — explicitly noted in the page's own comment (lines 33-36) as an intentional gap, relevant if the Insumos tab needs a title.

**What moves into a new Insumos tab**: everything on this page (the whole component tree) minus the page-level `<Header>`/gating wrapper — the route `/insumos` would then need to either redirect to `/finanzas?tab=insumos` or be retired, matching jebbs' structure where there's no standalone `/insumos` route at all.

## 3. Service gating (`lib/service-nav-map.ts`, `components/layout/sidebar.tsx`)

- `SERVICE_NAV_HREFS` (`lib/service-nav-map.ts:5-11`) is a `Record<serviceKey, hrefs[]>` — `stock_management: ["/insumos"]` is the only entry gating a page today (`web_orders` gates 4 routes, `ticket_printing` gates nothing visible).
- Enforcement is two-layer: `middleware.ts` redirects to `/plan` server-side, and `components/layout/sidebar.tsx`'s `isNavItemVisible` (lines 71-77) hides the nav link client-side by checking `activeServiceKeys`.
- Gating is **per-href, not per-tab** — `SERVICE_NAV_HREFS` has no concept of a URL query param (`?tab=insumos`) or of "gate only part of a page." A consolidated `/finanzas` page with `?tab=` deep-linking (as jebbs does — see `finanzas/page.tsx:216-219`, `goToTab`) cannot be gated at the tab level using today's mechanism without extending it.
- Two realistic strategies to ground for `sdd-propose`:
  (a) **Whole-page gate**: if `stock_management` is inactive, hide/redirect the entire `/finanzas` nav entry — but this would ALSO hide Resumen/Gastos/Recetas for a shop that has no stock_management service, which may be wrong if Gastos/Resumen should be available regardless of stock tracking.
  (b) **Per-tab gate inside the page**: keep `/finanzas` itself always visible (assuming some new baseline service, e.g. none, gates it), and have the page component itself check `activeServiceKeys` client-side to conditionally render/disable the Insumos and Recetas `TabsTrigger`s — this is a NEW pattern not used anywhere else in the codebase (every other gated page, per insumos/page.tsx's own comment lines 27-36, relies purely on route-level gating, never re-checks client-side).
  Neither is free — this is a real design decision to flag for `sdd-design`, not resolved here.
- No reserved service key exists yet for "gastos"/"finanzas" — unlike `stock_management`, which was reserved early in the prior chain. If Gastos is meant to be a paid/gated feature, a new service key would need to be added to this map (and presumably to whatever backend table drives `activeServiceKeys`, not found/read in this exploration — out of scope, flag for propose).

## 4. `lib/services/recipe-cost.ts` — makeable-count feasibility

Full file read (149 lines). Confirmed shape:
- `ProductSupplyWithSupply` (imported from `lib/types`, not redefined here) — each recipe line has `supply_id`, `quantity`, `scales_with_variant_group_id`, and an embedded `supply` object.
- `computeProductCost(recipe, variantFactors?)` → `{ total, lines, incomplete }`, using `resolveRecipeQuantities` (lines 71-82) for scaling resolution — the single source of truth for effective quantity, already shared with PR4's stock-deduction code per this file's own doc comment (lines 51-58).
- `computeMargin(basePrice, cost)` → `{ profit, marginPct }`.
- **No `computeMakeableCount` exists yet.** Adding it is straightforward and low-risk, following jebbs' `calculateMakeableCount`/`calculateLineMakeable` (`jebbs-dashboard/lib/utils/costing.ts:135-178`, fully read):
  - `calculateLineMakeable(quantity, stockQuantity)`: returns `null` for `quantity <= 0` (excluded from the MIN, not counted as 0), floors `stock/quantity` with a `1e-9` epsilon guard against float error (documented gotcha: `0.3/0.1 === 2.9999999999999996`).
  - `calculateMakeableCount(recipe)`: `MIN` across all lines' `calculateLineMakeable`, tracking `limitingSupplyId`. Deliberately per-product in isolation (not a joint multi-recipe stock allocation), and deliberately includes `is_active: false` supply lines in the calculation (only excluded from the "add new line" picker, not from makeable-count — under-reporting is the safe direction of error, over-reporting is the dangerous one).
  - morfito's `computeProductCost` already resolves `effectiveQuantity` via `resolveRecipeQuantities` (lines 71-82, 101, 112) — a `computeMakeableCount` in morfito's `recipe-cost.ts` should reuse that exact same resolved-quantity array (not re-derive scaling) to guarantee makeable-count and cost math can never drift on scaling, mirroring jebbs' own design intent (`costing.ts`'s own header comment lines 26-30: "callers resolve effective quantities once, up front... then hand plain lines to calculateBurgerCost / calculateMakeableCount... exactly as before").
  - This is genuinely trivial to add as a new pure function in `lib/services/recipe-cost.ts` — no schema change needed (`stock_quantity` already exists on `supplies`, ported in PR1/`041-supplies-and-stock.sql`).

## 5. Does morfito have anything resembling expenses/purchases today?

Confirmed: **no.** Grep for `expense|gasto|purchase|compra` (case-insensitive) across the whole repo returns exactly 2 files:
- `lib/utils/formatOrderWhatsapp.ts:185` — `"Gracias por tu compra 🙌"`, a customer-facing thank-you string, unrelated.
- `scripts/041-supplies-and-stock.sql:30` — a comment mentioning "purchases" in prose about manual stock corrections, not a real concept/table.

`lib/hooks/supplies/use-supplies-crud.ts`'s `useAdjustSupplyStock` (lines 148-178, fully read) confirms the exact gap called out in the brief: manual stock adjustment is a **full-value replace** (`stock_quantity: stockQuantity`, line 162) with **zero cost/expense tracking** — an operator bumping stock up (a restock) is indistinguishable from correcting it down (a stocktake fix); nothing records what was paid, when, or why. There is no `order_stock_movements`-equivalent ledger for manual adjustments (unlike order-completion deductions, which DO get a ledger row per `use-order-stock-sync.ts`). This confirms the prior proposal's "morfito has no expenses module" claim is still accurate post-merge.

## 6. `lib/hooks/supplies/use-order-stock-sync.ts` (morfito) vs. jebbs' expense→stock-bump

Fully read (326 lines). Key mechanism, for comparison against jebbs' expense-triggered stock bump:
- `syncOrderStockForTransition` (lines 286-311) is the single shared entry point for every order-status-writing mutation, deciding apply/reverse/no-op purely from `(from, to)` status pair.
- **Idempotency**: driven by the `order_stock_movements` ledger (`UNIQUE(order_id, supply_id)`), never by `orders.status` alone — before decrementing, it reads which supplies already have a ledger row for this order and skips them (line 159-165). A `23505` unique-violation on insert is swallowed as already-applied (lines 192-199).
- **Write ordering** (documented as non-negotiable, lines 27-39): decrement `stock_quantity` BEFORE inserting the ledger row (apply); delete the ledger row BEFORE incrementing stock back (reverse) — always biased toward under-counting stock on a crash, never over-counting.
- **No RPC/transaction** — plain client-side read-then-write (comment lines 56-62), explicitly noted as matching every other stock writer in the codebase.

Comparing against jebbs' `useCreateExpense`/`useDeleteExpense` (`jebbs-dashboard/lib/hooks/use-expenses.ts`, fully read, lines 83-223):
- jebbs' expense→stock bump is **NOT** backed by any ledger table — it's a bare read-then-write on `supplies.stock_quantity` (lines 111-125), with no equivalent of `order_stock_movements`. This means it has **no idempotency guard at all** — a retried/duplicated expense create would double-bump stock, unlike morfito's order-completion path.
- jebbs distinguishes "expense committed but stock bump failed" via custom error classes `StockUpdateError`/`StockRevertError` (lines 22-56) — since there's no transaction, once the `expenses` row insert/delete commits, a failure in the *following* stock UPDATE is surfaced as a **distinct error type** so the UI doesn't tell the user to retry (which would duplicate the expense) — it instead points them to Insumos to fix stock by hand (`finanzas/page.tsx:340-347`, `356-361`).
- jebbs' reversal (delete-expense) explicitly does NOT floor at 0 (comment lines 190-194) — matches morfito's own "negative stock is legal" design principle (`scripts/041-supplies-and-stock.sql`'s "DELIBERATE DESIGN CHOICES" note, referenced in `use-supplies-crud.ts:141-143`).
- **Direct parallel worth carrying into design**: morfito's ledger+idempotency pattern is strictly more robust than jebbs'. If morfito ports "expense optionally bumps stock," the natural design is to reuse (or mirror) the `order_stock_movements`-style ledger approach rather than jebbs' bare read-then-write — this is flagged as a design decision, not resolved here, since it changes the migration shape (an `expense_stock_movements`-like table, or reusing `order_stock_movements` with a nullable `order_id` and a new `expense_id`, vs. jebbs' no-ledger approach).

## 7. jebbs-dashboard expenses schema (full migration trail)

Base table, `jebbs-dashboard/scripts/003-costs-schema.sql` (fully read, "Costs, expenses and net revenue — Phase 1"):
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('supplies', 'services', 'salaries', 'rent', 'other')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('supplies', 'services', 'salaries', 'rent', 'other')),
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
(Same file also creates `supplies` and `burger_supplies` — already superseded in morfito by PR1/PR4's own `041`/`042` migrations, not relevant here except as historical context.)

Subsequent amendments (all fully read):
- `005-recurring-expense-frequency.sql`: adds `frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly'))` to `recurring_expenses`.
- `006-recurring-expense-amount-nullable.sql`: drops `NOT NULL` on `recurring_expenses.amount` — weekly/biweekly templates become purely informational (description + frequency + start_date only), since their actual per-payment amount varies and gets logged as a one-off `expenses` row instead (comment lines 6-14 explain this explicitly — a real business rule to carry into design questions).
- `008-expense-supply-link.sql`: adds `expenses.supply_id UUID REFERENCES supplies(id) ON DELETE SET NULL` and `expenses.quantity DECIMAL(10,3)` — both nullable, no CHECK tying them together (validated in UI only) — this is the column pair that powers the optional stock-bump-on-expense feature.
- `009-supply-purchase-basis.sql`: adds `supplies.purchase_mode/purchase_price/purchase_units` — unrelated to expenses directly, but powers the "cómo lo comprás" (package/weight/unit) cost-preview UI reused by the expense dialog's `SupplyQuantityInput` component (`finanzas/page.tsx:1005-1011`).

Conventions confirmed consistent across every jebbs migration (also stated explicitly in `PORTING-TO-DISHFLOW.md`'s "Cross-cutting conventions" section, lines 91-97): no DB `CHECK` beyond simple enums, `information_schema`/`pg_tables` pre-flight checks as SQL comments, `BEGIN`/`COMMIT` wrapping, `ADD COLUMN` never `ADD COLUMN IF NOT EXISTS`, documented undo. Morfito's own `041`-`044` migrations already follow this same style (confirmed by their own header comments), so a new `045+` expenses migration should match it.

**No dedicated expenses porting doc exists** in jebbs — `docs/PORTING-TO-DISHFLOW.md` (107 lines, fully read) covers 7 topics (recipes-for-every-product, config-scaled recipe lines, negative stock, automatic stock deduction, order-source+commission, revenue-by-source, price adjustment) — all already ported in the just-merged 5-PR chain. **Expenses/gastos is not mentioned anywhere in this doc** — confirming the prior change's explicit scoping-out was deliberate, not an oversight, and that this new SDD change has no pre-existing "problem→decision→why" writeup to lean on the way the prior chain did. `sdd-propose` will need to derive the expenses design fresh from the raw schema/hooks read here, not from a distilled doc.

## 8. jebbs `finanzas/page.tsx` structure (full read, 1344 lines)

Confirms and deepens the brief's premise:
- 4 tabs exactly as stated: `resumen | gastos | insumos | recetas` (line 98), URL-synced via `?tab=` (lines 208-219), `router.replace` (no history growth).
- Gastos tab has 2 sub-tabs: `period` ("Del período" — one-off expenses list + create dialog) and `recurring` ("Fijos mensuales" — recurring templates + create/update/delete). This sub-tab structure is a genuine additional layer of nav nesting not mentioned in the brief's summary — worth flagging for design.
- Resumen tab composes: `GastosSummaryRow` (KPI tiles), `ExpensesByCategoryChart` + `DailyIncomeVsExpensesChart` (side-by-side), `NetRevenueCard`, `DailyLedger` — all fed from a SINGLE `useOrdersAnalytics` call (line 250-255, only fetched `tab === "resumen"` — gated to avoid the heavy query running when the tab isn't visible) plus `useExpenses`/`useRecurringExpenses`.
- **Net revenue formula**, confirmed via `jebbs-dashboard/lib/hooks/orders/use-orders-history.ts:563-564`: `netRevenue = currentRevenue - expensesTotal - commissionTotal`, where `expensesTotal = periodExpensesTotal + recurringTotal` (line 563) — recurring templates are prorated day-by-day over the selected period (not simply summed), a nontrivial calculation not detailed further here (out of scope for explore, flag for design). `commissionTotal` in jebbs comes from a hardcoded `pedidosya` bucket (line 482) — jebbs' commission model appears less generalized than morfito's own operator-configurable order-sources+commission system (already ported in morfito's PR2, `scripts/043-order-source-and-commission.sql`) — **morfito's version is actually more complete here**, this is a place where morfito should NOT blindly mirror jebbs.
- The ledger (`DailyLedger`) is built from `analytics.ledger`, an array of `{date, kind: "income"|"expense", amount}` rows assembled server-analytics-side (`use-orders-history.ts:634-712` in jebbs) — this is a genuinely new derived data shape morfito's `use-orders-history.ts` does not have today (confirmed below).
- Category taxonomy: `'supplies' | 'services' | 'salaries' | 'rent' | 'other'` (from the CHECK constraint, `003-costs-schema.sql:29`), with Spanish labels mapped in `lib/utils/expenses.ts`.
- Stock-bump UX in the expense dialog (`finanzas/page.tsx:968-1026`): supply selection is optional even when `category === "supplies"`; only when both `supply_id` AND a resolved quantity are present does the expense bump stock (line 324-325, `hasSupplyQuantity`) — explicit UI copy makes this optional and visible to the user before saving (lines 994-999, 1012-1022).

## 9. morfito's current analytics — confirms the Resumen tab is a real net-new gap

Fully read `lib/hooks/orders/use-orders-history.ts` (morfito, 660 lines). Confirmed:
- `useOrdersAnalytics` computes `totalRevenue` (orders + `external_income`, lines 206-217), `avgTicket`, `canceledOrders`, `dailyData` — but **no `expensesTotal`, `netRevenue`, `commissionTotal`, or `ledger`** anywhere in its return object (lines 271-284). This is a genuine, currently-nonexistent aggregation in morfito.
- `useRevenueBySource` (lines 558-660, PR3 addition) already sums `orders.total_amount` + `external_income.amount` grouped by `source`, with an explicit `UNKNOWN_SOURCE_KEY` bucket (never silently merged into a named channel, line 560-564 comment) — this pattern is directly reusable for a Gastos-by-category aggregation.
- `orders.commission_amount`/`commission_rate` exist in the DB schema (`scripts/043-order-source-and-commission.sql:70-71`, confirmed: `NOT NULL DEFAULT 0`, frozen at order-creation time per the migration's own header comment lines 20-26) and ARE written by `use-create-order.ts`/`use-update-order.ts` — but **are never summed into any analytics total today**. A `commissionTotal` for a future net-revenue calc is a straightforward `SUM(commission_amount)` over the same date-filtered `orders` query `useOrdersAnalytics` already runs — the raw data exists, the aggregation does not.
- Net revenue in morfito would need: `totalRevenue - expensesTotal(new) - commissionTotal(new SUM)`.

## 10. Migration numbering

`Glob scripts/*.sql` confirms the highest existing number is `044-order-stock-movements.sql` (PR5). **Next free number is `045`.** No gaps, no undocumented additions beyond `000`→`044` (full list: 000, 001, 002, 010, 020, 030, 031, 040, 041, 042, 043, 044).

## 11. Staging recommendation (grounding only — not a decision)

Evidence supports the brief's proposed staging, with adjustments:

| Stage | Scope | Risk/complexity driver |
|---|---|---|
| (a) UI consolidation: new `/finanzas` page, Insumos + Recetas tabs, move existing `/insumos` content + `/precios`' recipe-editor/cost/margin out | Real migration of shipped functionality (retiring `/insumos` route, removing recipe UI from `/precios`); needs the gating strategy resolved first (§3) since this is where it bites | HIGH — touches gating, gets least benefit from "it's all new code" cover |
| (b) Makeable-count calculation | Add `computeMakeableCount`/`computeLineMakeable` to `lib/services/recipe-cost.ts`, wire into whatever the Recetas tab table becomes | LOW — pure function, no schema change, evidence in §4 shows it's nearly mechanical |
| (c) Expenses + recurring-expenses module (Gastos tab) | New tables (`045+`), new hooks mirroring `use-expenses.ts`, new UI, decide on stock-bump-on-expense semantics (§6 — ledger vs. bare read-write) | MEDIUM-HIGH — genuinely new schema + a real design decision on the stock-linkage mechanism |
| (d) Resumen tab (net revenue) | Depends on (c) existing (`expensesTotal`) and needs `commissionTotal` added to `useOrdersAnalytics` (§9 — straightforward SUM, data already exists) | MEDIUM — depends on (c), but the underlying data (commission_amount, revenue) already exists in morfito, less net-new than jebbs' equivalent |

One adjustment to the brief's ordering: (d) has a *smaller* incremental cost in morfito than in jebbs, because `commission_amount` already exists and is populated (§9) — jebbs had to build its whole commission concept from scratch as part of net revenue; morfito already has it from the prior PR chain. This makes (c)→(d) a tighter, lower-risk pair than it was for jebbs.

Whether (a) ships before or after (b)/(c)/(d), or whether (b) should be folded into (a) since both touch the same Recetas tab UI, is a real staging call for `sdd-propose`/`sdd-tasks`, not resolved here.

## Open questions for the user

1. Does Gastos need recurring expenses (weekly/biweekly/monthly templates with proration) from day one, or is a first slice of one-off expense entries only acceptable, with recurring expenses deferred?
2. Does morfito want the "expense optionally bumps stock" linkage jebbs has (§6), and if so, should it reuse a ledger-backed idempotent mechanism (like `order_stock_movements`) rather than jebbs' bare read-then-write with no duplicate-retry protection — or is jebbs' simpler (weaker) version acceptable for a first cut?
3. Gating strategy for the new `/finanzas` page (§3): whole-page gate on `stock_management` (which would also hide Gastos/Resumen for shops without stock tracking), a new dedicated service key, or a new per-tab client-side gating pattern not used anywhere else in the codebase today — which tradeoff does the business want?
4. Should `/insumos` become a redirect to `/finanzas?tab=insumos` (preserving old bookmarks/links) or be fully retired with no redirect?
5. Expense categories: adopt jebbs' fixed 5 (`supplies/services/salaries/rent/other`) as-is, or does morfito's business need a different/extended set?
6. Should morfito's commission math feed into net revenue exactly as jebbs' does (`revenue - expenses - commission`), given morfito's commission model (per-order-source, frozen at creation) is already more complete than jebbs' hardcoded single-channel version — any reason to diverge from that formula?
