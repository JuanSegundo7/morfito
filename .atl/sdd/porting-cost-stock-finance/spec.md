# Spec: Cost, Stock, Finance and Order-Source Capabilities

**Change**: porting-cost-stock-finance · **Project**: morfito
**Status**: NEW capabilities (no prior spec exists — `stock_management` service key is reserved but unbuilt; orders currently have no `source`/`commission`/`price_adjustment` fields).

---

## Domain: supply-inventory

### Purpose
A supplies catalog with unit cost and on-hand quantity, editable via a new `/insumos` page, gated by the existing `stock_management` service key.

### Requirement: Supplies catalog
The system MUST provide a `supplies` entity with name, unit, cost_per_unit, stock_quantity, and is_active.

#### Scenario: Create a supply
- GIVEN an operator on `/insumos`
- WHEN they create a supply with name, unit, cost_per_unit and initial stock_quantity
- THEN the supply is persisted and appears in the catalog

### Requirement: Stock may go negative
Stock quantity MUST allow negative values. No DB CHECK, JS clamp, or `min="0"` input attribute MUST restrict it anywhere a stock value is written.

#### Scenario: Manual adjustment past zero
- GIVEN a supply with stock_quantity = 2
- WHEN the operator applies a manual adjustment of -5
- THEN stock_quantity becomes -3, the write succeeds without error, and `/insumos` shows a warning state (not a blocking error) for that row

### Requirement: /insumos gated by stock_management
The `/insumos` sidebar entry MUST be hidden when the `stock_management` service is inactive for the account, and visible when active, following the existing `SERVICE_NAV_HREFS` gating convention (`lib/service-nav-map.ts`).

#### Scenario: Service inactive
- GIVEN an account without `stock_management` active
- WHEN the sidebar renders
- THEN no `/insumos` entry is shown

### Requirement: Insufficient stock never blocks
Negative or insufficient stock MUST NOT block any sale, order completion, or other UI action anywhere outside `/insumos`. `/insumos` itself only warns, never blocks.

#### Scenario: Sale with insufficient stock
- GIVEN a supply with stock_quantity = 1 and a recipe requiring 5 units for the sold quantity
- WHEN the order is completed
- THEN the sale completes normally and stock_quantity becomes -4 (or reflects the actual deduction), with no confirmation dialog or blocking error anywhere in the order flow

---

## Domain: product-recipes

### Purpose
Every sellable product (main/side/drink/addon) can declare a recipe through ONE `product_supplies` table, with derived cost and margin surfaced in `/precios`.

### Requirement: Single recipe table for all product kinds
The system MUST provide `product_supplies` (product_id FK, supply_id FK, quantity) usable by any product row regardless of whether it's a main, side, drink, or addon — no separate table per product kind.

#### Scenario: Recipe on a non-main product
- GIVEN an addon product with no recipe yet
- WHEN the operator adds a `product_supplies` line for it
- THEN the addon's cost/margin in `/precios` reflects that recipe line exactly as a main dish's would

### Requirement: Derived cost and margin in /precios
Cost per product MUST be computed as the sum of `quantity × supply.cost_per_unit` across its recipe lines. Margin MUST be computed as `product price − computed cost` and MUST be displayed alongside existing price columns in `/precios`.

#### Scenario: Cost with multiple recipe lines
- GIVEN a product with two recipe lines (2 × supply A at $10/unit, 1 × supply B at $5/unit)
- WHEN `/precios` renders that product's row
- THEN cost shows $25 and margin shows price − $25

### Requirement: Cost cache invalidation on supply cost change
Editing a supply's `cost_per_unit` MUST invalidate every recipe/cost/margin value derived from it — no product's `/precios` row may keep showing a cost computed from the old `cost_per_unit`.

#### Scenario: Supply cost edit propagates
- GIVEN a product whose recipe references supply X, currently priced at $10/unit
- WHEN the operator edits supply X's cost_per_unit to $15
- THEN the product's cost/margin in `/precios` reflects $15/unit on next view, with no stale cached value shown

---

## Domain: variant-scaled-recipes

### Purpose
A recipe line can scale with a product's own variant option (e.g. "12 piezas" vs "20 piezas"), consuming `quantity × factor` instead of a flat quantity.

### Requirement: Variant options carry a quantity_factor
`variant_options.quantity_factor` MUST be a NUMERIC column, `NOT NULL DEFAULT 1`, `CHECK (quantity_factor > 0)`.

#### Scenario: Default factor
- GIVEN a variant option created without specifying quantity_factor
- WHEN it is read back
- THEN quantity_factor = 1

### Requirement: Recipe line may scale with a variant group
A `product_supplies` row MAY declare `scales_with_variant_group_id` (FK to `variant_groups`). When set, the line's effective quantity for cost/deduction purposes MUST equal `quantity × selected_option.quantity_factor`, resolved once via a single pure resolution step (e.g. `resolveRecipeQuantities()`), never recomputed downstream by cost math or deduction math separately.

#### Scenario: Scaled line effective quantity
- GIVEN a recipe line with base quantity = 2, scaled to a variant group whose selected option has quantity_factor = 3
- WHEN cost is computed for an order selecting that option
- THEN the effective consumed quantity is 6, and both cost display and stock deduction use that same resolved value

### Requirement: quantity_factor frozen at order time
Order-time variant selections MUST snapshot the chosen option's quantity_factor at creation, exactly as `price_delta` is already frozen in `VariantSelectionEntry`. A later edit to `variant_options.quantity_factor` MUST NOT change what a past order is considered to have consumed.

#### Scenario: Factor edited after order placed (grounded gotcha — historical-order integrity)
- GIVEN an order placed when a variant option's quantity_factor was 2
- WHEN the operator later edits that variant_options row's quantity_factor to 3
- THEN the already-placed order's frozen snapshot still reflects factor 2 for any recomputation or audit

### Requirement: Editable quantity field always shows the BASE value
The recipe-line quantity input MUST always read and write the BASE (unscaled) quantity, never the effective (scaled) quantity — regardless of how many times the line is viewed or saved.

#### Scenario: Repeated save does not re-multiply (grounded gotcha — jebbs shipped this exact bug)
- GIVEN a scaled recipe line with base quantity = 2 and factor = 3 (effective = 6)
- WHEN the operator opens the recipe editor (which displays "2", never "6", as the editable field) and saves without changing anything, twice in a row
- THEN the stored base quantity remains 2 after both saves — it never becomes 6, then 18

### Requirement: Fixed↔scaled conversion is a prefill, never automatic
Flipping a recipe line between fixed and scaled MUST offer an editable conversion suggestion (deriving one form's quantity from the other's quantity and the relevant factor) in BOTH directions. The suggested value MUST be pre-filled into an editable field, never auto-applied/saved without operator action.

#### Scenario: Flip fixed → scaled
- GIVEN a fixed recipe line with quantity = 4
- WHEN the operator switches it to scaled against a variant group
- THEN the editor pre-fills a suggested base quantity derived from 4 and the reference factor, editable before saving, not silently committed

#### Scenario: Flip scaled → fixed
- GIVEN a scaled recipe line with base quantity = 2 and factor = 3
- WHEN the operator switches it to fixed
- THEN the editor pre-fills a suggested fixed quantity derived from 2 and 3, editable before saving, not silently committed

### Requirement: Missing selection resolves to factor 1
When an order/context has no variant selection for the scaling group (legacy order, no-selection product), the effective factor MUST resolve to 1, never 0.

#### Scenario: Legacy order with no variant_selections
- GIVEN a pre-existing order_item with `variant_selections = null` and a recipe line scaled to a group it doesn't reference
- WHEN cost/deduction resolves that line
- THEN the effective quantity equals the base quantity (factor = 1), not zero

### Requirement: quantity_factor is consumption-only
quantity_factor MUST NOT participate in price computation. `price_delta` remains the sole pricing input for a variant option; quantity_factor only affects recipe/stock consumption.

#### Scenario: Price unaffected by factor
- GIVEN a variant option with price_delta = $500 and quantity_factor = 3
- WHEN an order total is computed for that selection
- THEN the price contribution is exactly $500, unaffected by the factor of 3

---

## Domain: order-stock-deduction

### Purpose
Completing an order deducts recipe-derived stock via an idempotent ledger; un-completing/cancelling reverses it automatically.

### Requirement: Deduction trigger
Stock deduction MUST occur when an order transitions to status `completed` (not `ready`, not any other status).

#### Scenario: Deduction on completion
- GIVEN an order in status `ready` with a product that has a recipe
- WHEN the operator marks it `completed`
- THEN stock for each recipe supply decreases by the resolved effective quantity

### Requirement: Idempotent via ledger table
Deduction idempotency MUST be driven by a ledger table (`order_stock_movements`), never by `orders.status` alone. Re-triggering "mark completed" on an order that already has ledger rows for that order_id MUST be a no-op per supply — no double deduction.

#### Scenario: Duplicate completion is a no-op (grounded gotcha — status alone is not a safe idempotency key)
- GIVEN an order already completed, with ledger rows already written for its supplies
- WHEN the "mark completed" action is retried (double click, network retry)
- THEN no additional stock decrement occurs and no duplicate ledger rows are inserted

### Requirement: Write ordering biases toward under-counted stock
On deduction, the system MUST decrement stock BEFORE inserting the ledger row. On reversal, the system MUST delete the ledger row BEFORE adding stock back. Both orderings MUST bias failure toward "stock reads lower than truth" rather than a ledger row claiming a deduction that never happened.

#### Scenario: Partial failure during deduction
- GIVEN the stock decrement write succeeds but the subsequent ledger insert fails
- WHEN the operator retries
- THEN the system does not end up with a ledger row implying stock was deducted twice, and the observable state trends toward stock reading lower than the true remaining quantity, never higher

### Requirement: Automatic reversal on un-complete/cancel
Un-completing or cancelling a previously-completed order MUST automatically restore stock (add back every ledger row's quantity) and delete the corresponding ledger rows, with no manual operator action required.

#### Scenario: Cancel after completion restores stock exactly
- GIVEN a completed order whose ledger recorded supply X at −5 units
- WHEN the order is cancelled or reverted from `completed`
- THEN supply X's stock increases by exactly 5 and the order's ledger rows are deleted

### Requirement: Deduction resolves every physical line shape
Deduction MUST enumerate and resolve: `order_items.kind = 'product'` (direct recipe), `kind = 'combo'` (resolved through `combo_slots` + the order's stored selection), `kind = 'addon'` (standalone recipe), and any `order_item_modifiers` rows attached to a line.

#### Scenario: Combo deduction as legal intermediate state
- GIVEN a combo line whose slot-resolution logic is not yet implemented in this stage
- WHEN the order is completed
- THEN the combo line deducts nothing (zero movement), completion still succeeds without error, and this is treated as an accepted intermediate state, not a bug

### Requirement: Modifier quantity is not re-multiplied by parent line quantity
A modifier's (`order_item_modifiers`) quantity MUST be used as-is for deduction, NOT multiplied again by its parent `order_items.quantity`. (Verified against `lib/hooks/orders/use-create-order.ts`: modifier rows are inserted with an independently pre-computed `quantity`/`subtotal`, not derived by multiplying against the parent line at read time.)

#### Scenario: Modifier deduction uses its own quantity
- GIVEN an order_item with quantity = 3 and one attached order_item_modifiers row with quantity = 1
- WHEN deduction resolves that modifier's recipe consumption
- THEN it consumes based on quantity = 1, not 3

### Requirement: Insufficient stock never blocks deduction
(Cross-referenced from supply-inventory.) Deduction MUST proceed and go negative rather than block order completion.

#### Scenario: Deduction below zero
- GIVEN a supply with stock_quantity = 1 and a completing order requiring 5 units
- WHEN deduction runs
- THEN stock_quantity becomes -4 and order completion is not blocked

---

## Domain: order-source-commission

### Purpose
Orders carry a sales channel (`source`) and a frozen commission snapshot, with channel-aware UX gating and display/persistence parity.

### Requirement: orders.source is nullable and never defaulted
`orders.source` MUST be a nullable TEXT column. NULL means unknown/legacy and MUST NEVER be coerced to a default channel value by any read or write path.

#### Scenario: Legacy order stays unknown
- GIVEN an order created before this change shipped (source is NULL by migration default)
- WHEN it is displayed anywhere source is shown (e.g. revenue-by-source breakdown)
- THEN it is shown/bucketed as "unknown", never silently treated as "local" or any other default channel

### Requirement: Commission frozen at order time
`orders.commission_rate` and `orders.commission_amount` MUST be written once at order creation/edit time and MUST NOT be re-read live from a configured default rate afterward — same treatment as `discount_type`/`discount_value`/`discount_amount`, which are already frozen per row (`000-baseline-schema.sql:238-240`).

#### Scenario: Rate change doesn't affect past orders
- GIVEN an order created with source='pedidosya', commission_rate=0.15
- WHEN the operator later changes the configured default commission rate (localStorage)
- THEN the existing order's commission_rate and commission_amount are unchanged

### Requirement: Commission basis and effect on total
`commission_amount` MUST equal `subtotal_items × commission_rate` (delivery fee excluded from the base). `commission_amount` MUST reduce `total_amount` (shop receives less), and MUST render as its own labeled line wherever the order's price breakdown is shown, matching how `discount_amount` is already displayed.

#### Scenario: Commission line reduces total
- GIVEN an order with subtotal_items = 1000 and commission_rate = 0.15
- WHEN the total is computed
- THEN commission_amount = 150, and total_amount is reduced by 150 relative to an equivalent order with no commission, shown as its own line in the breakdown

### Requirement: Channel-aware wizard gating
The order wizard MUST show or hide sections based on the selected source (e.g. commission-related fields only meaningful for an external channel).

#### Scenario: Local order hides commission section
- GIVEN the operator selects a local/walk-in source
- WHEN the wizard renders
- THEN commission-related fields are not shown

### Requirement: Single effective value for display and persistence
Every channel-conditional derived value (e.g. an effective delivery fee under an external channel) MUST be computed ONCE and used for BOTH on-screen display AND the submitted/persisted payload — never two separate computations.

#### Scenario: Display/submit parity (grounded gotcha — jebbs shipped exactly this bug)
- GIVEN an external-channel order where the effective delivery fee should read as zero for that channel
- WHEN the order is submitted
- THEN the on-screen total shown to the operator during entry equals the total actually persisted to the database — both read the same single effective delivery-fee value, not one computed from the raw form field and another from a channel override

---

## Domain: order-price-adjustment

### Purpose
A signed, dedicated flat adjustment applied before commission — verified NOT to reuse morfito's existing discount machinery.

### Code verification performed (informs the requirements below)
Read `components/order-wizard/components/discount-section.tsx`, `components/order-wizard/steps/summary-step.tsx`, `components/orders/order-details-modal.tsx`, `lib/utils/formatOrderWhatsapp.ts`, and `components/order-wizard/services/order-price-calculator.ts`. Confirmed:
- Every discount display path is gated on a strictly-positive check: `discountAmount > 0` (`summary-step.tsx:388,714`; `order-details-modal.tsx:425`; `formatOrderWhatsapp.ts:152`) or `discountValue > 0` (`discount-section.tsx:100`).
- `OrderPriceCalculator.calculateDiscountAmount` explicitly treats `discountValue <= 0` as "no discount" and returns 0 (`order-price-calculator.ts:149-151`) — so a negative value routed *through that function* cannot inflate the total.
- However, `calculateOrderTotal` computes `total = subtotal - discountAmount + deliveryFee` directly against whatever `discountAmount` is (`order-price-calculator.ts:223`). If a negative "adjustment" value were ever written directly into `discount_amount` (bypassing `calculateDiscountAmount`, e.g. via a raw payload), it would silently inflate the total while every `> 0`-gated display path would hide it entirely.
- Conclusion: the proposal's concern is structurally valid — reusing the discount channel for `price_adjustment` is unsafe. The requirements below mandate a fully separate field, computation, and display condition.

### Requirement: Dedicated field, not a negative discount
`orders.price_adjustment` MUST be its own signed NUMERIC column (positive or negative), separate from `discount_type`/`discount_value`/`discount_amount`. It MUST NOT be implemented by writing a negative value into any discount field.

#### Scenario: Adjustment does not touch discount fields
- GIVEN an order with a price_adjustment of -300 (a markdown)
- WHEN the order is persisted
- THEN discount_type/discount_value/discount_amount are unaffected (independent of price_adjustment), and price_adjustment=-300 is stored in its own column

### Requirement: Own display condition, not >0 gating
price_adjustment MUST render as its own labeled line wherever a discount currently renders, using a non-zero condition (`!== 0`), NOT the discount convention's `> 0` gate — since a negative adjustment is a legitimate, displayable value, unlike a negative discount which is invalid input.

#### Scenario: Negative adjustment is visible
- GIVEN an order with price_adjustment = -300
- WHEN the order summary/details renders
- THEN a "Ajuste de precio: -$300" (or equivalent) line is shown, distinct from the discount line, even though the value is negative

### Requirement: Applied before commission
price_adjustment MUST be added to the order total BEFORE commission is computed, since the platform charges commission on the price it listed (subtotal + adjustment), not the shop's internal menu price.

#### Scenario: Commission computed on adjusted total
- GIVEN subtotal_items = 1000, price_adjustment = +200, commission_rate = 0.15
- WHEN commission_amount is computed
- THEN commission_amount = (1000 + 200) × 0.15 = 180, not 1000 × 0.15 = 150

### Requirement: Defaults to zero, optional
price_adjustment MUST default to 0 and be optional on every order (existing and new).

#### Scenario: Order without adjustment
- GIVEN an order created without specifying price_adjustment
- WHEN it is read back
- THEN price_adjustment = 0 and no adjustment line renders anywhere

---

## Domain: revenue-by-source-analytics

### Purpose
`/rendimiento` breaks down revenue by channel; manual `external_income` entries can be tagged into the right channel bucket; vocabulary split resolves the `external_income` naming collision without renaming the table.

### Requirement: Revenue breakdown card by source
`/rendimiento` MUST show a revenue breakdown grouped by `orders.source`, including a distinct "unknown" bucket for NULL-source orders.

#### Scenario: Breakdown across channels
- GIVEN one order with source='pedidosya' totaling $1000, one legacy order with source=NULL totaling $500
- WHEN `/rendimiento` renders the breakdown
- THEN pedidosya shows $1000, "unknown" shows $500, and no order is silently folded into a default channel

### Requirement: external_income.source tags manual entries into a channel
`external_income` MUST gain a nullable `source` column sharing `orders.source`'s allowed-value set, so a manual entry (e.g. a manually-recorded PedidosYa payout) can be counted in that channel's bucket instead of defaulting to "unknown".

#### Scenario: Tagged manual entry joins its channel
- GIVEN a manual external_income entry of $200 with source='pedidosya'
- WHEN `/rendimiento` computes the pedidosya bucket
- THEN that $200 is included alongside pedidosya orders' revenue

#### Scenario: Untagged manual entry stays unknown
- GIVEN a manual external_income entry with source=NULL
- WHEN the breakdown renders
- THEN that entry's amount appears in "unknown", not silently in "local" or any default bucket

### Requirement: Vocabulary split resolves the external_income naming collision
UI copy MUST distinguish the manual income ledger from the per-order channel concept without renaming the `external_income` table. Manual-ledger copy MUST use "Ingresos manuales"/"Otros ingresos"; the word "external" MUST NOT appear in user-facing copy for the manual ledger. The per-order channel concept MUST use "Canal de venta"/"Origen del pedido".

#### Scenario: Copy audit
- GIVEN the external-income panel and the order-source selector both rendered in the UI
- WHEN their labels are inspected
- THEN neither surface displays the word "external" to the user, and each uses its own distinct vocabulary ("Ingresos manuales" vs "Canal de venta")

---

## Cross-cutting notes (not separate requirements, carried from proposal for implementer awareness)
- Migrations follow morfito's `scripts/NNN-*.sql` convention starting at 041, with WHY banners, information_schema pre-flight comments, BEGIN/COMMIT, `ADD COLUMN` (never `IF NOT EXISTS`), and documented rollback.
- No RPCs in morfito — deduction stays client-side read-then-write; the write-ordering requirements above are the accepted mitigation for the resulting non-atomicity.
- Single-column CHECK constraints follow morfito's existing convention (e.g. `orders.status`); cross-column invariants (e.g. "exactly one of product_id/combo_id") stay in app code, matching current `order_items` practice.
