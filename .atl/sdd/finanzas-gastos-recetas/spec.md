# Spec: finanzas-gastos-recetas — Consolidated /finanzas

Delta spec — what MUST be true after this change is applied. Grounded in the approved proposal
(`.atl/sdd/finanzas-gastos-recetas/proposal.md`). Scenarios are written to be equally valid as
automated tests (where a test runner exists) or a manual QA checklist (where it doesn't), matching
this repo's established pattern from `porting-cost-stock-finance`'s apply-progress files.

## Test-tooling note (verification, not a proposal re-litigation)

`package.json` has no `test` script and no `vitest`/`jest`/any test-runner devDependency. This
confirms the pattern already recorded in `.atl/sdd/porting-cost-stock-finance/apply-progress-pr2.md`
("Strict TDD disabled (no test runner)"). The proposal's claim that PR2 (`computeMakeableCount`)
is "Strict TDD applies" is **carried from the proposal but unverified against actual repo
tooling** — no runner exists to enforce red-green-refactor. Every `recipe-makeable-count` scenario
below is written so it is directly usable as a future automated unit test (pure-function
input/output assertions) AND as a manual QA checklist item today. Do not block PR2 on a test
runner that does not exist; do not silently drop test rigor either — write the pure function so
its behavior is trivially verifiable by inspection/manual trace against these scenarios.

---

## Domain 1: finance-navigation

Requirements for the `/finanzas` shell, its 4 tabs, URL sync, whole-page gating, and the
`/insumos` retirement.

### Requirement: `/finanzas` renders 4 tabs — Resumen, Gastos, Insumos, Recetas

The route `app/(dashboard)/finanzas/page.tsx` MUST render exactly 4 tabs in this order: Resumen,
Gastos, Insumos, Recetas. Insumos tab content MUST be the same functional surface previously at
`/insumos` (`LowStockBanner`, combo-lines-not-counted banner, `SupplyList`, `SupplyFormDialog`,
delete `AlertDialog`) — moved wholesale, not reimplemented.

- Scenario: operator opens /finanzas with no query params
  - **Given** a user with `stock_management` service access navigates to `/finanzas`
  - **When** the page renders
  - **Then** all 4 tabs (Resumen, Gastos, Insumos, Recetas) are visible
  - **And** a default tab is active (Resumen, per the tab list order)

### Requirement: active tab syncs to `?tab=` via `router.replace`, not `router.push`

Switching tabs MUST update the URL's `tab` query param using `router.replace`, never
`router.push` — this must NOT grow browser history per tab switch.

- Scenario: switching tabs does not grow history stack
  - **Given** a user is on `/finanzas?tab=resumen`
  - **When** they click the Gastos tab, then the Insumos tab, then the Recetas tab (3 switches)
  - **Then** the URL ends at `/finanzas?tab=recetas`
  - **And** pressing the browser back button once navigates away from `/finanzas` entirely (not
    to `/finanzas?tab=insumos` or any intermediate tab state) — proving no history entries were
    pushed per switch

### Requirement: `?tab=` deep-links directly to the named tab on load

Loading `/finanzas?tab=gastos` (or any valid tab key) directly MUST activate that tab without
first flashing the default tab.

- Scenario: deep link to Gastos tab
  - **Given** a user navigates directly to `/finanzas?tab=gastos`
  - **When** the page finishes rendering
  - **Then** the Gastos tab is the active tab

- Scenario: unknown/invalid `?tab=` value falls back to default
  - **Given** a user navigates to `/finanzas?tab=nonexistent`
  - **When** the page renders
  - **Then** the page falls back to the default tab (Resumen) rather than rendering a blank or
    crashing state

### Requirement: `/finanzas` is gated by `stock_management` as a whole-page gate

There is no per-tab gating in this change. Access to `/finanzas` is all-or-nothing, governed by
the existing `stock_management` service flag, matching the pre-existing whole-page gate pattern
`/insumos` already used (no new gating mechanism introduced).

- Scenario: user without `stock_management` access is blocked from all tabs
  - **Given** a user's account does NOT have `stock_management` service access
  - **When** they attempt to navigate to `/finanzas` (any `?tab=` value, including `/finanzas`
    with no param)
  - **Then** the page-level gate blocks the entire page (same behavior class as pre-change
    `/insumos` gating), not just the tab they attempted to deep-link into

### Requirement: `SERVICE_NAV_HREFS.stock_management` lists both `/finanzas` and `/insumos`

`lib/service-nav-map.ts`'s `stock_management` entry MUST be `["/finanzas", "/insumos"]` (both
paths listed), not `["/finanzas"]` alone — confirmed necessary because middleware's redirect
chain (`/insumos` → `/finanzas?tab=insumos` → `/plan` if ungated) would otherwise take two hops
and the sidebar-hide logic would break for `/insumos` specifically if it were omitted from the
gated-hrefs list.

- Scenario: sidebar hides both routes for ungated users
  - **Given** a user without `stock_management` access
  - **When** the sidebar renders
  - **Then** neither a `/finanzas` nor an `/insumos` sidebar entry is shown
  - **And** the sidebar's single visible entry for this service (if shown to an authorized user)
    labels/links to `/finanzas`, not `/insumos`

### Requirement: `/insumos` redirects to `/finanzas?tab=insumos`, never hard-retired

`app/(dashboard)/insumos/page.tsx` MUST become a redirect (not a 404, not a static "moved" page)
to `/finanzas?tab=insumos`. Existing bookmarks/links to `/insumos` MUST continue to work.

- Scenario: visiting the old /insumos URL redirects to the new tab
  - **Given** a user with `stock_management` access navigates to `/insumos` directly (e.g. an
    old bookmark)
  - **When** the page loads
  - **Then** the browser ends up at `/finanzas?tab=insumos` with the Insumos tab active
  - **And** the Supply list / low-stock banner content renders identically to how it did at the
    old `/insumos` route

### Requirement: Resumen tab's analytics query only fires when Resumen is the active tab

The (extended) `useOrdersAnalytics` query backing the Resumen tab's summary numbers MUST NOT
fetch when a different tab (Gastos/Insumos/Recetas) is active — this avoids an unnecessary heavy
query firing on every `/finanzas` page load regardless of which tab the user actually opened.

- Scenario: opening /finanzas on the Gastos tab does not trigger the Resumen analytics query
  - **Given** a user navigates directly to `/finanzas?tab=gastos`
  - **When** the page renders and no tab switch has occurred
  - **Then** the Resumen tab's analytics data-fetching hook is not in a fetching/fetched state
    (its query is disabled/not enabled while `tab !== "resumen"`)

- Scenario: switching to Resumen triggers the query exactly then
  - **Given** a user is on `/finanzas?tab=gastos` (Resumen query not yet fired)
  - **When** they click the Resumen tab
  - **Then** the Resumen analytics query becomes enabled and fetches at that point (not before)

### Requirement: `/precios` loses cost/margin UI and `RecipeEditor`, keeps price-editing UI

`/precios` retains: default delivery-fee config, order-source/commission config, and ALL
price-editing UI across its 5 existing tabs (Hamburguesas/Extras/Bebidas/Papas/Combos). It MUST
lose: the inline cost/margin display block and the `RecipeEditor` mount (both move to Recetas).

- Scenario: /precios no longer shows cost/margin or recipe editing
  - **Given** a user expands a burger row on `/precios`
  - **When** the row expands
  - **Then** no cost/margin figures are shown and no `RecipeEditor` is mounted in that row
  - **And** the price-editing controls for that product are still present and functional

- Scenario: /precios' other 4 tabs are untouched
  - **Given** a user opens the Extras / Bebidas / Papas / Combos tabs on `/precios`
  - **When** each tab renders
  - **Then** their price-editing UI is unchanged from pre-change behavior (this change does not
    touch cost/margin UI for extras/drinks/fries/combos — out of scope per proposal)

---

## Domain 2: recipe-makeable-count

Requirements for the new `computeMakeableCount` function in `lib/services/recipe-cost.ts`. Every
edge case named explicitly in the proposal's business rules gets its own scenario below.

### Requirement: `computeMakeableCount` derives from the same resolved-quantity array as `computeProductCost`

`computeMakeableCount` MUST call `resolveRecipeQuantities` (the existing exported function) to
get its per-line effective quantities — the same array `computeProductCost` already builds — not
re-derive `quantity * factor` independently. This is a hard requirement: cost and makeable-count
must never be able to drift on variant-scaled recipe lines because they used two different
resolution paths.

- Scenario: makeable count and cost agree on which effective quantity a scaled line used
  - **Given** a recipe line with `scales_with_variant_group_id` set and a `variantFactors` map
    supplying a factor of `2` for that group
  - **When** both `computeProductCost(recipe, variantFactors)` and
    `computeMakeableCount(recipe, variantFactors)` are called with the same `recipe` and
    `variantFactors` arguments
  - **Then** the effective quantity used internally for that line is identical in both
    calculations (traceable to the same `resolveRecipeQuantities(recipe, variantFactors)` call)

### Requirement: makeable count is the MIN across recipe lines of `floor(stock_quantity / effectiveQuantity)`

For each recipe line with a resolvable supply and `effectiveQuantity > 0`, compute
`floor(stock_quantity / effectiveQuantity)`. The overall makeable count for the product is the
MIN of these per-line values across all included lines.

- Scenario: basic MIN-across-lines computation
  - **Given** a recipe with 2 lines: Line A (supply stock 10, effective quantity 2 → floor(10/2)
    = 5), Line B (supply stock 9, effective quantity 3 → floor(9/3) = 3)
  - **When** `computeMakeableCount` runs
  - **Then** the result is `3` (the MIN of 5 and 3), with Line B identified as the limiting
    supply

### Requirement: a line with `quantity <= 0` is EXCLUDED from the MIN, never counted as `0`

A recipe line whose (base or effective) quantity is `<= 0` MUST be excluded from the MIN
computation entirely — it contributes no value to the MIN (conceptually `null`/skipped), and must
NEVER be treated as contributing a `0`, which would incorrectly zero out the whole product's
makeable count.

- Scenario: zero-quantity line does not zero the makeable count
  - **Given** a recipe with 2 lines: Line A (stock 10, effective quantity 2 → would floor to 5),
    Line B (effective quantity 0, malformed/misconfigured data)
  - **When** `computeMakeableCount` runs
  - **Then** the result is `5` (from Line A only) — Line B is excluded from the MIN, not treated
    as contributing `floor(x/0)` or a hard `0`

- Scenario: negative-quantity line is also excluded (same rule, defensive case)
  - **Given** a recipe line with effective quantity `-1` (should not occur but is defensively
    handled)
  - **When** `computeMakeableCount` runs
  - **Then** that line is excluded from the MIN identically to the `quantity === 0` case

- Scenario: all lines have `quantity <= 0`
  - **Given** every recipe line has effective quantity `<= 0`
  - **When** `computeMakeableCount` runs
  - **Then** the result reflects "no constraining lines" (e.g. `null`/unbounded — MUST NOT be `0`,
    since `0` would falsely claim the product is currently unmakeable when in fact no valid
    constraint could be evaluated)

### Requirement: inactive (`is_active: false`) supply lines ARE included in the calculation

Unlike `computeProductCost` (which excludes inactive-supply lines from the cost total, marking
`incomplete: true` instead), `computeMakeableCount` MUST INCLUDE inactive-supply lines in the MIN
computation using their current `stock_quantity`. Rationale (from proposal): under-reporting
makeable count is the safe error direction; over-reporting (letting an inactive/discontinued
ingredient's line silently not constrain the count) is dangerous — it could tell staff a product
is makeable when a discontinued ingredient's stock has actually run out or is untrustworthy.

- Scenario: inactive supply line still constrains the makeable count
  - **Given** a recipe with 2 lines: Line A (active supply, stock 100, effective quantity 1 →
    floor = 100), Line B (INACTIVE supply, stock 2, effective quantity 1 → floor = 2)
  - **When** `computeMakeableCount` runs
  - **Then** the result is `2` (Line B, despite its supply being inactive, still participates in
    and wins the MIN) — this differs from how `computeProductCost` would treat the same line
    (excluded, `incomplete: true`)

### Requirement: `1e-9` epsilon guard against float-precision error in the division

The `floor(stock_quantity / effectiveQuantity)` computation MUST apply a `1e-9` epsilon guard so
float-imprecise divisions (e.g. `0.3 / 0.1`, which floating point evaluates to
`2.9999999999999996` instead of exactly `3`) do not get incorrectly floored down by one.

- Scenario: float-imprecise division does not under-count by one
  - **Given** a recipe line with supply `stock_quantity = 0.3` and effective quantity `0.1`
    (a division that floating-point arithmetic naturally evaluates to `2.9999999999999996`
    rather than exactly `3`)
  - **When** `computeMakeableCount` runs
  - **Then** the per-line makeable value for that line is `3`, not `2` — the epsilon guard (e.g.
    computing `floor(stock_quantity / effectiveQuantity + 1e-9)`) corrects the float-precision
    error rather than silently under-reporting by one unit

### Requirement: a line whose supply cannot be resolved is excluded (conservative default, unconfirmed by user — see Risks)

The proposal's business rules explicitly cover `quantity <= 0` (excluded) and `is_active: false`
(included) but do not explicitly state the behavior for a recipe line whose `supply` cannot be
resolved at all (the `missing` case `computeProductCost` already tracks). This spec makes an
assumption, flagged in the Risks section below: a missing-supply line is EXCLUDED from the MIN
(same treatment as `quantity <= 0`), not treated as zero stock. Rationale for consistency with the
"under-report is safe" philosophy: a missing/unresolvable supply line has no reliable
`stock_quantity` to evaluate at all (there is nothing to floor-divide), so it is skipped rather
than forced to `0` — mirroring exactly how `quantity <= 0` lines are skipped, not zeroed.

- Scenario: unresolvable supply line does not zero the makeable count
  - **Given** a recipe with 2 lines: Line A (stock 10, effective quantity 2 → floor = 5), Line B
    (supply cannot be resolved — `missing: true`, e.g. a bad/orphaned `supply_id` join)
  - **When** `computeMakeableCount` runs
  - **Then** the result is `5` (from Line A only) — Line B is excluded, not treated as `0`

---

## Domain 3: recetas-consolidated-view

Requirements for the Recetas tab: consolidated cross-product searchable table + margin chart,
replacing `/precios`' per-product-expand cost/margin UX.

### Requirement: Recetas tab shows one row per product with cost, price, margin %, makeable count, and limiting supply

The Recetas tab MUST render a single searchable table with one row per product (not per-line, not
requiring per-product expansion) with at minimum: product name, computed cost (`computeProductCost`),
price, margin % (`computeMargin`), makeable count (`computeMakeableCount`), and the name of the
limiting supply (the recipe line whose per-line floor value equals the reported makeable count).

- Scenario: table renders without per-product expansion required
  - **Given** the Recetas tab is active with N products having recipes
  - **When** the tab renders
  - **Then** all N products' cost/price/margin/makeable-count/limiting-supply figures are visible
    simultaneously, without the user needing to click/expand any individual row first

### Requirement: the table is searchable by product name

A search input MUST filter the table's rows by product name substring match, client-side or
server-side — the specific implementation is a design decision, but the behavior (typing narrows
visible rows to matching products) MUST hold.

- Scenario: searching filters the product list
  - **Given** the Recetas table lists products including "Doble Cheddar" and "Clásica"
  - **When** the user types "cheddar" into the search input
  - **Then** only "Doble Cheddar" (and any other name-matching products) remain visible in the
    table

### Requirement: a margin comparison chart is present on the Recetas tab

The Recetas tab MUST render a chart comparing margin % (or margin/profit) across products —
a capability `/precios`' per-product-expand UX never offered (the stated gap this unit closes:
"which product has the worst margin" was previously unanswerable without expanding rows
one-by-one).

- Scenario: margin chart reflects the same margin data as the table
  - **Given** the Recetas table shows product margin percentages
  - **When** the margin comparison chart renders
  - **Then** the chart's per-product values match the table's `computeMargin`-derived margin
    percentages for the same products (same source of truth, no separate computation)

### Requirement: `RecipeEditor` is reachable from the Recetas tab (moved from `/precios`)

Editing a product's recipe (the `RecipeEditor` component, previously mounted inside `/precios`'
expanded burger row) MUST be reachable from the Recetas tab — e.g. via a row action — and MUST
NOT remain mounted/reachable from `/precios` (see Domain 1's `/precios` requirement above).

- Scenario: editing a recipe from Recetas persists and updates the same table
  - **Given** a user opens `RecipeEditor` for a product from the Recetas tab and changes a recipe
    line's quantity, then saves
  - **When** the Recetas table re-renders
  - **Then** that product's cost/margin/makeable-count figures reflect the updated recipe (no
    separate cache/stale-data path — same invariant as the pre-existing rule that cost/margin are
    always derived on demand, never their own cached query)

### Requirement: incomplete cost data (missing/inactive supply) is still surfaced in the consolidated view

`computeProductCost`'s existing `incomplete: true` flag (for missing/inactive recipe-line
supplies) MUST still be visibly surfaced per-row in the consolidated table — this pre-existing
signal must not be silently dropped when the cost/margin UI moves from `/precios` to Recetas.

- Scenario: a product with an inactive ingredient shows an incomplete-cost indicator
  - **Given** a product's recipe includes one line whose supply `is_active: false`
  - **When** that product's row renders in the Recetas table
  - **Then** the row visibly indicates the cost figure is incomplete (matching the existing
    `incomplete` semantics), while its makeable-count figure still includes that inactive line
    per Domain 2's inactive-inclusion rule (the two indicators are independent and can disagree
    — cost incomplete, makeable count still computed)

---

## Domain 4: expense-tracking

Requirements for one-off expense create/list/delete (PR4 scope — no stock bump yet, that's
Domain 5 / PR5).

### Requirement: `expenses` table enforces category as a 5-value CHECK constraint

The `expenses` table (migration `045+`, exact DDL is design's job) MUST have a `category` column
constrained (DB-level CHECK) to exactly the 5 values: `supplies`, `services`, `salaries`, `rent`,
`other`. No 6th value, no extension in this change.

- Scenario: creating an expense with an invalid category is rejected
  - **Given** a user attempts to create an expense with `category: "marketing"` (not one of the
    5 allowed values)
  - **When** the create request reaches the database
  - **Then** the insert is rejected by the CHECK constraint (not silently accepted, not
    client-side-only validated)

- Scenario: creating an expense with each of the 5 valid categories succeeds
  - **Given** a user creates 5 expenses, one per valid category (`supplies`, `services`,
    `salaries`, `rent`, `other`)
  - **When** each create request is submitted
  - **Then** all 5 succeed

### Requirement: expenses require `date` and `amount`; `description`, `supply_id`, `quantity` are optional

`date` and `amount` MUST be NOT NULL. `description` is nullable free text. `supply_id` (FK →
supplies) and `quantity` are both nullable — an expense may exist with neither, matching the
explicit business rule that "supplies"-category expenses may remain unlinked to any specific
supply row (forcing linkage would make staff skip logging entirely).

- Scenario: an unlinked "supplies"-category expense is valid
  - **Given** a user creates an expense with `category: "supplies"`, a `date`, an `amount`, and
    NO `supply_id`/`quantity`
  - **When** the create request is submitted
  - **Then** the expense is created successfully (no stock-bump side effect fires — see Domain 5)

- Scenario: creating an expense without a date or amount fails
  - **Given** a user attempts to create an expense missing `date` or missing `amount`
  - **When** the create request is submitted
  - **Then** the request is rejected

### Requirement: expenses can be listed filtered by date range

`useExpenses` (or equivalent hook) MUST support fetching expenses within a given date range (for
the Gastos tab's period view).

- Scenario: listing expenses for a specific period
  - **Given** expenses exist with dates both inside and outside a target date range
  - **When** the Gastos tab's period view queries that range
  - **Then** only expenses whose `date` falls within the range are returned

### Requirement: expenses can be aggregated by category for a period

The Gastos tab MUST show totals-by-category for the selected date range, following the same
shape/spirit as the existing `useRevenueBySource` pattern (group by category, explicit handling
for any expense whose category value is unexpected — never silently merged into another bucket).

- Scenario: category totals sum correctly for a period
  - **Given** within the selected date range there are 3 `supplies`-category expenses totaling
    $300 and 2 `rent`-category expenses totaling $500
  - **When** the Gastos tab's by-category aggregation runs
  - **Then** it reports `supplies: $300` and `rent: $500` (and $0 for the other 3 categories with
    no expenses in range, not omitted entirely)

### Requirement: an expense can be deleted; no update/edit capability exists in this change

`useDeleteExpense` MUST exist and remove the expense row. There is deliberately no
`useUpdateExpense` / edit UI in this change (matches the source-of-truth jebbs implementation,
which itself only has create+delete, no update) — this is an explicit out-of-scope, not an
oversight.

- Scenario: deleting an expense removes it from the list and from category totals
  - **Given** an expense exists and is included in the current period's category totals
  - **When** the user deletes it (with confirmation)
  - **Then** it no longer appears in the expense list
  - **And** the category totals for that period recompute to exclude it

- Scenario: no edit affordance exists for an existing expense
  - **Given** a user views an existing expense row in the Gastos tab
  - **When** they look for an edit/update action
  - **Then** none is present — only view (in the list) and delete are available

---

## Domain 5: expense-stock-sync

Requirements for the ledger-backed idempotent expense→stock bump/reverse (PR5 scope). Schema
shape is intentionally NOT prescribed here (deferred to design) — requirements below describe
observable behavior only ("an idempotent ledger keyed by expense+supply exists"), not table/column
names.

### Requirement: a stock bump fires ONLY when an expense has BOTH `supply_id` AND `quantity`

Creating an expense with only one of `supply_id`/`quantity` set (or neither) MUST NOT trigger any
stock movement. Both must be present together.

- Scenario: expense with supply_id but no quantity does not bump stock
  - **Given** a user creates an expense with `category: "supplies"`, `supply_id` set, and
    `quantity` NULL
  - **When** the expense is created
  - **Then** the linked supply's `stock_quantity` is unchanged
  - **And** no ledger entry is created for this expense

- Scenario: expense with quantity but no supply_id does not bump stock
  - **Given** a user creates an expense with `quantity` set but `supply_id` NULL
  - **When** the expense is created
  - **Then** no supply's stock is changed and no ledger entry is created

- Scenario: expense with both supply_id and quantity bumps stock exactly once
  - **Given** a user creates an expense with `category: "supplies"`, `supply_id` pointing at a
    supply with current `stock_quantity = 10`, and `quantity = 5`
  - **When** the expense is created
  - **Then** the supply's `stock_quantity` becomes `15`
  - **And** a ledger entry recording this expense↔supply movement exists

### Requirement: the stock bump is idempotent — a retried/duplicated expense-create is a hard no-op on the stock side

Before decrementing/incrementing stock, the system MUST pre-check the ledger for an existing
entry keyed by (expense, supply) — mirroring `order_stock_movements`'s
`UNIQUE(order_id, supply_id)` idempotency pattern conceptually. A `23505` unique-violation on the
ledger insert MUST be swallowed as "already applied," never surfaced as a hard error, never
causing a second stock adjustment.

- Scenario: a retried expense-create request does not double-bump stock
  - **Given** an expense with `supply_id` + `quantity = 5` was already successfully created and
    its stock bump already applied (supply stock went from 10 to 15, ledger entry exists)
  - **When** the exact same create request is retried (e.g. network retry / duplicate submit
    producing the same expense+supply pairing)
  - **Then** the supply's `stock_quantity` remains `15` (not `20`) — the ledger pre-check
    (or the `23505` unique-violation swallow path) prevents a second increment

### Requirement: write ordering follows `order_stock_movements`' pattern — decrement-before-insert / delete-before-increment

The bump path MUST perform the stock write (increment) and the ledger write (insert) in the same
ordering discipline `order_stock_movements` established. The reverse path (expense deletion) MUST
perform the stock write (decrement back) before removing the ledger entry — matching the
"decrement-before-insert / delete-before-increment" ordering named in the proposal, so a crash
mid-operation leaves the ledger as the source of truth for whether the stock-side effect has
already happened.

- Scenario: ledger entry existence is the authoritative signal of "stock effect applied"
  - **Given** the bump/reverse write ordering is implemented as specified
  - **When** any operation is interrupted between its two writes (stock write and ledger write)
  - **Then** the ledger entry's presence/absence — not the stock value alone — is what the
    idempotency pre-check relies on to decide whether to (re)apply or skip the stock effect

### Requirement: deleting a stock-linked expense reverses the stock movement without flooring at zero

Deleting an expense that had a successful stock bump MUST reverse it (decrement the supply's
`stock_quantity` back by the same `quantity`) and MUST NOT clamp the result at `0` — negative
stock is legal in morfito (matches the existing `supplies.stock_quantity` convention) and signals
a real problem (e.g. stock was independently corrected downward elsewhere in the meantime).

- Scenario: deleting a stock-linked expense can drive stock negative
  - **Given** a supply's `stock_quantity` is currently `3` (after other adjustments unrelated to
    this expense) and an expense previously bumped it by `+5` (ledger entry exists)
  - **When** that expense is deleted
  - **Then** the supply's `stock_quantity` becomes `-2` (3 - 5), NOT floored at `0`

### Requirement: a failed stock bump after a committed expense surfaces "adjust stock manually," never "retry"

Because there is no transaction spanning the expense-create and the stock-bump (per the
`order_stock_movements`-mirrored, non-transactional pattern), if the expense row commits but the
subsequent stock-bump write fails, the UI MUST surface guidance to adjust stock manually. It MUST
NOT offer a "retry" action for the stock bump specifically, because retrying would re-attempt
create-adjacent logic that could duplicate the expense row itself rather than just the stock
write.

- Scenario: stock-bump failure after expense commit shows manual-adjustment guidance
  - **Given** an expense with `supply_id` + `quantity` is submitted and the expense row commits
    successfully, but the subsequent stock-bump write fails (e.g. transient DB error)
  - **When** the UI reports this outcome to the user
  - **Then** it communicates that the expense was saved but stock was not automatically adjusted,
    directing the user to adjust stock manually
  - **And** no "retry" button/action is offered for the stock-bump step itself

---

## Domain 6: finance-summary

Requirements for the Resumen tab's aggregate figures. This domain carries the single
highest-stakes requirement in the whole change per the proposal: commission must never be
subtracted twice.

### Requirement: `netRevenue = totalRevenue - expensesTotal` (commission NOT subtracted again)

`useOrdersAnalytics`'s extension MUST compute `netRevenue` as exactly `totalRevenue -
expensesTotal`. `commissionTotal` (SUM of `orders.commission_amount`) MUST be computed and
displayed, but MUST NOT be subtracted from `netRevenue` — because `orders.total_amount` (the
source of `totalRevenue`) is already net of commission (verified: `use-create-order.ts:104`
computes `itemsTotal + priceAdjustment - discountAmount - commissionAmount + delivery_fee` when
building `total_amount`). Subtracting `commissionTotal` again in the Resumen aggregation would
double-count it.

- Scenario: commission is not double-subtracted from net revenue (MANDATORY — highest-stakes scenario in this change)
  - **Given** a period contains orders whose `total_amount` values already reflect
    `commission_amount` having been subtracted at order-creation time (per
    `use-create-order.ts`'s formula) — e.g. one order with `total_amount = 90` where
    `commission_amount = 10` was already subtracted from what would otherwise have been `100`
  - **When** the Resumen tab computes `totalRevenue` (SUM of `total_amount` = `90` for this
    order), `commissionTotal` (SUM of `commission_amount` = `10` for this order), `expensesTotal`
    (e.g. `20` for this period), and `netRevenue`
  - **Then** `netRevenue = totalRevenue - expensesTotal = 90 - 20 = 70`
  - **And** `netRevenue` is explicitly NOT computed as `totalRevenue - expensesTotal -
    commissionTotal` (which would incorrectly yield `60`, double-subtracting the commission
    already baked out of `total_amount`)
  - **And** `commissionTotal` (`10`) is displayed elsewhere on the Resumen tab purely as an
    informational figure, not folded into any subtraction

### Requirement: `commissionTotal` is shown with explicit "already deducted" framing, never as a cost line item

The Resumen tab MUST present `commissionTotal` as informational context (e.g. "Comisiones de
canales: -$X, ya descontadas de la facturación" or equivalent), visually and semantically distinct
from any line that participates in the `netRevenue` subtraction (i.e. distinct from
`expensesTotal`'s presentation).

- Scenario: commission line is visually/semantically separated from the expenses total
  - **Given** the Resumen tab renders both `expensesTotal` and `commissionTotal`
  - **When** a user reads the summary
  - **Then** `commissionTotal` is labeled/framed as already-deducted informational context (not
    as an expense category, not as a line subtracted again from any displayed total)

### Requirement: `expensesTotal` for a period is the SUM of expense `amount` within that date range

`expensesTotal` MUST equal the sum of `expenses.amount` for expenses whose `date` falls within
the Resumen tab's selected period — using the same date-ranged aggregation Domain 4 already
requires of the Gastos tab (not a separately-derived computation).

- Scenario: expensesTotal matches the Gastos tab's period total for the same range
  - **Given** the same date range is selected on both the Gastos tab and the Resumen tab
  - **When** both compute their respective expense totals
  - **Then** the Resumen tab's `expensesTotal` equals the Gastos tab's summed total for that
    range (single source of truth, not two divergent computations)

### Requirement: Resumen renders a summary row, expenses-by-category chart, daily income-vs-expenses chart, and net revenue card

The Resumen tab MUST render, at minimum: a summary row (totalRevenue, expensesTotal,
commissionTotal, netRevenue), an expenses-by-category chart (reusing Domain 4's category
aggregation), a daily income-vs-expenses chart, and a distinct net revenue card.

- Scenario: all 4 Resumen elements are present when the tab is active and data loads
  - **Given** the Resumen tab is active and its analytics query has resolved
  - **When** the tab renders
  - **Then** the summary row, expenses-by-category chart, daily income-vs-expenses chart, and net
    revenue card are all visible

---

## Risks / assumptions requiring follow-up (not proposal re-litigation — spec-level gaps only)

1. **Missing-supply behavior in `computeMakeableCount`** (Domain 2, last requirement): the
   proposal names `quantity <= 0` (excluded) and `is_active: false` (included) explicitly but is
   silent on a recipe line whose supply cannot be resolved at all (`missing: true` in
   `computeProductCost`'s existing terms). This spec assumes "excluded, same as `quantity <= 0`"
   for consistency with the stated exclusion pattern — NOT explicitly confirmed by the user.
   Flag for design/apply review.
2. **PR2 Strict TDD claim is unverified against actual repo tooling.** No test runner
   (`vitest`/`jest`/etc.) exists in `package.json` as of this spec. The proposal's "Strict TDD
   applies" note for PR2 is carried forward but cannot be enforced mechanically today. Scenarios
   in Domain 2 are written to double as manual QA checklist items for this reason.
3. **Exact ledger schema shape (new table vs. extending `order_stock_movements`)** is explicitly
   deferred to `sdd-design` per the proposal; Domain 5's requirements are written schema-shape-
   agnostic ("a ledger exists," "a ledger entry," never a table/column name) to avoid
   prematurely constraining that design decision.
4. **`incomplete` interaction between cost and makeable-count on the same row** (Domain 3, last
   requirement): the spec asserts these two indicators are independent and may disagree (cost
   incomplete due to an inactive supply, while makeable count still includes that same line).
   This follows directly from Domain 2's explicit inactive-inclusion rule but the *visual*
   treatment of two potentially-disagreeing indicators on one row is left to design/apply.
