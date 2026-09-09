// ============================================
// BASE TYPES - Directamente de la DB
// ============================================

export type OrderStatus = "new" | "ready" | "completed" | "canceled"; // ❌ Eliminar "paid" (no está en DB)
export type ExtraCategory = "extra" | "drink" | "fries" | "sides";
export type DeliveryType = "pickup" | "delivery";
export type PaymentMethod = "cash" | "transfer";
export type DiscountType = "amount" | "percentage" | "none";

// ============================================
// CUSTOMER
// ============================================

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
}

// ============================================
// BURGERS
// ============================================

export interface Burger {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  ingredients: string[];
  is_available: boolean;
  image_url: string | null;
  default_meat_quantity: number; // Viene de DB como smallint
  default_fries_quantity: number; // Viene de DB como numeric
  created_at: string;
}

// ============================================
// EXTRAS
// ============================================

export interface Extra {
  id: string;
  name: string;
  category: ExtraCategory;
  price: number;
  is_available: boolean;
  created_at: string;
}

// ============================================
// PRODUCTS (generic products/variant_groups/variant_options — Phase 2,
// see scripts/010-generic-products.sql). `burgers`/`extras` above stay as
// the shapes exposed by the compat VIEWS the order wizard still reads;
// these are the shapes of the underlying `products` table the admin pages
// now read/write directly.
// ============================================

export type VariantSelection = "single" | "multi";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  is_available: boolean;
  image_url: string | null;
  ingredients: string[];
  is_addon: boolean;
  // NULL for burger-derived (is_addon = false) rows. Preserves the old
  // extras.category value for addon rows — see 010-generic-products.sql §1.
  legacy_extra_category: ExtraCategory | null;
  // NULL for addon rows — see 010-generic-products.sql §1 for why these
  // stayed plain columns instead of being derived from variant groups.
  default_meat_quantity: number | null;
  default_fries_quantity: number | null;
  created_at: string;
}

export interface VariantGroup {
  id: string;
  product_id: string | null;
  label: string;
  selection: VariantSelection;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface VariantOption {
  id: string;
  variant_group_id: string;
  label: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  // Cost/stock/finance porting (scripts/042-product-supplies.sql): scaling
  // multiplier for a recipe line that opts into `scales_with_variant_group_id`
  // — 1 means "no scaling" (the column default for every pre-existing row
  // and every group a recipe line doesn't scale by). See that migration's
  // header for the backfill formula and its sort_order = 0 edge case.
  quantity_factor: number;
  created_at: string;
}

export interface VariantGroupWithOptions extends VariantGroup {
  variant_options: VariantOption[];
}

export interface ProductWithVariantGroups extends Product {
  variant_groups: VariantGroupWithOptions[];
}

// ============================================================
// SUPPLIES / RECIPES (cost, stock, finance porting — PR1, see
// scripts/041-supplies-and-stock.sql and
// scripts/042-product-supplies.sql). `supplies` is the raw-ingredient
// inventory model; `product_supplies` is the recipe join table linking a
// `products` row to the supplies (and quantities) it consumes.
// ============================================================

export type SupplyUnit = "g" | "kg" | "ml" | "l" | "unit";

export interface Supply {
  id: string;
  name: string;
  unit: SupplyUnit;
  cost_per_unit: number;
  // No floor enforced anywhere on this value — negative stock is a valid,
  // meaningful state by design. See scripts/041-supplies-and-stock.sql's
  // "DELIBERATE DESIGN CHOICES" note.
  stock_quantity: number;
  min_stock_quantity: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductSupply {
  id: string;
  product_id: string;
  supply_id: string;
  quantity: number;
  // Optional: when set, this recipe line's effective quantity scales with
  // the selected VariantOption.quantity_factor in that group. NULL means
  // the line is flat (no scaling). See scripts/042-product-supplies.sql.
  scales_with_variant_group_id: string | null;
  created_at: string;
}

export interface ProductSupplyWithSupply extends ProductSupply {
  supply: Supply;
}

// ============================================
// VARIANT SELECTIONS (frozen price snapshot — Phase 3, see
// scripts/020-order-items-variant-selections.sql). One entry per selected
// variant option on an order_item, with price_delta COPIED from
// variant_options.price_delta at order-creation time so a later edit to the
// live variant_options row never re-prices an already-placed order.
// ============================================

export interface VariantSelectionEntry {
  variant_group_id: string;
  variant_group_label: string;
  variant_option_id: string;
  variant_option_label: string;
  price_delta: number;
  // Cost/stock/finance porting, PR2 (scripts/043 is a no-op for this column
  // — it lives on variant_options, not orders/order_items — see
  // scripts/042-product-supplies.sql): frozen copy of the selected
  // VariantOption.quantity_factor at order-creation time, mirroring how
  // price_delta above is already frozen. Optional/nullable because every
  // order_item row created before this PR shipped has no such value stored
  // — READERS of this field (recipe-cost/stock-deduction consumers) MUST
  // treat a missing/null/legacy value as factor 1 (no scaling), never 0 —
  // see lib/utils/variant-pricing.ts's resolveFrozenQuantityFactor and
  // lib/services/recipe-cost.ts's resolveRecipeQuantities, which are the
  // enforced read-back points for this rule.
  quantity_factor?: number | null;
}

// ============================================
// ORDERS
// ============================================

export interface Order {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string;
  customer?: { phone: string | null; customer_addresses?: CustomerAddress[] } | null;
  customer_address_id: string | null; // 🆕 Agregado de DB
  status: OrderStatus;
  is_paid: boolean;
  total_amount: number;
  delivery_type: DeliveryType; // 🆕 Agregado de DB
  delivery_fee: number; // 🆕 Agregado de DB
  payment_method: PaymentMethod; // 🆕 Agregado de DB
  delivery_time: string | null; // 🆕 AGREGAR
  discount_type: DiscountType | null; // 🆕 Agregado de DB
  discount_value: number; // 🆕 Agregado de DB
  discount_amount: number; // 🆕 Agregado de DB
  notes: string | null;
  // Cost/stock/finance porting, PR2 (scripts/043-order-source-and-commission.sql):
  // which sales channel this order came from — an operator-configured
  // string (see lib/utils/commission.ts's getOrderSources()), NOT a fixed
  // enum, so no CHECK constraint exists in the DB. Null means no channel
  // was selected (e.g. a walk-in order) — never coerced to a default.
  source: string | null;
  // Frozen at order-creation time from whatever commission rate was
  // configured for `source` at that moment — never re-derived from live
  // config afterward. 0 for every order with no source or no configured
  // rate for it.
  commission_rate: number;
  commission_amount: number;
  // Cost/stock/finance porting, PR3: signed flat amount adjusting the
  // order total, added to itemsTotal BEFORE discount/commission are
  // subtracted (see use-create-order.ts/use-update-order.ts's `total`
  // formula). Own field — never derived from or folded into
  // discount_type/discount_value/discount_amount. Column added by PR2's
  // migration (scripts/043), wired up here in PR3.
  price_adjustment: number;
  created_at: string;
  updated_at: string;
}

// Phase 4 (scripts/030-order-items-cutover.sql): what an order_item's
// product_id/combo_id mean is now an explicit discriminator instead of the
// old "exactly one of burger_id/extra_id/combo_id is set" convention that
// was only ever enforced in application code.
export type OrderItemKind = "product" | "combo" | "addon";

export interface OrderItem {
  id: string;
  order_id: string;
  // Phase 4: replaces burger_id/extra_id — both already pointed at
  // products(id) after Phase 1's FK repoint (scripts/010-generic-
  // products.sql), so this is a same-target rename, not a re-pointing.
  // Null when kind === "combo".
  product_id: string | null;
  kind: OrderItemKind;
  combo_id: string | null; // 🆕 Agregado de DB — untouched by Phase 4, combos are Phase 5's job
  // Generic per-line-item display name (burger, combo, or side name — see
  // scripts/030-order-items-cutover.sql's "WHY burger_name IS KEPT" note
  // for why this was NOT renamed to name_snapshot despite the DB
  // genericization: too many readers across the app still use this exact
  // name for non-burger items).
  burger_name: string;
  // Phase 4: additive frozen copy of burger_name at creation time, written
  // going forward by lib/hooks/orders/use-create-order.ts /
  // use-update-order.ts. Null on rows created before Phase 4 shipped.
  name_snapshot: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations: string | null;
  // Phase 3 (scripts/020-order-items-variant-selections.sql): additive
  // column, so it's absent/null on every order_item row created before
  // Phase 3 shipped. See services/order-data-loader.ts's loadBurgers for
  // how the null case falls back to the pre-Phase-3 behavior.
  variant_selections?: VariantSelectionEntry[] | null;
  created_at: string;
}

// Phase 4: renamed from OrderItemExtra to match the order_item_modifiers
// table rename (scripts/030-order-items-cutover.sql) — extra_id/extra_name
// -> product_id/name_snapshot.
export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  product_id: string;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

// ============================================
// EXTENDED TYPES - Con relaciones
// ============================================

export interface OrderItemWithExtras extends OrderItem {
  extras: OrderItemModifier[];
}

export interface OrderWithItems extends Order {
  customer?: { phone: string | null } | null;
  customer_address?: CustomerAddress | null; // Nombre consistente con DB
  items: OrderItemWithExtras[];
}

// ============================================================
// STOCK DEDUCTION (cost/stock/finance porting, PR4 — Group 7a, see
// scripts/044-order-stock-movements.sql). Ledger of raw-supply stock
// actually decremented for a completed order, keyed by (order_id,
// supply_id) — see that migration's header for why this is order-scoped
// rather than order_item-scoped.
// ============================================================

export interface OrderStockMovement {
  id: string;
  order_id: string;
  supply_id: string;
  quantity: number;
  created_at: string;
}

/** One aggregated supply consumption for an order — always positive. */
export interface DeductionLine {
  supply_id: string;
  quantity: number;
}

/**
 * Result of lib/services/stock-deduction.ts's buildStockDeductionPlan.
 * `skipped` surfaces order_item lines that were NOT deducted rather than
 * silently dropping them — in this PR (7a) that's exclusively kind="combo"
 * lines, always with reason "no-recipe" (combo-slot parsing, and therefore
 * "combo-unparsed", is 7b's job — a separate later PR).
 */
export interface DeductionPlan {
  lines: DeductionLine[];
  skipped: { reason: "combo-unparsed" | "no-recipe"; label: string }[];
}

// ============================================
// EXTERNAL INCOME
// ============================================

export interface ExternalIncome {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string | null;
  // Cost/stock/finance porting, PR2 (scripts/043-order-source-and-commission.sql):
  // same channel concept as Order.source above. NOT wired into any UI yet
  // in this PR — reserved for PR3.
  source: string | null;
  created_at: string;
}

// ============================================
// EXPENSES
// ============================================

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

// ============================================
// FRONTEND TYPES - Para el wizard
// ============================================

export type WizardStep = "customer" | "burgers" | "summary";

export interface OrderItemDraft {
  id: string;
  burger: Burger;
  quantity: number;
  meatCount: number;
  meatPriceAdjustment: number;
  removedIngredients: string[];
  selectedExtras: { extra: Extra; quantity: number }[];
}
