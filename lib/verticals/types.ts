/**
 * Vertical configuration layer.
 *
 * The `products` + `variant_groups` + `variant_options` schema (see
 * morfito-generic-products-refactor) lets one codebase serve
 * burger/sushi/pizza/etc verticals, with vertical-specific behavior
 * isolated behind the `VerticalDefinition` shape declared here.
 *
 * See lib/verticals/burger.ts and lib/verticals/sushi.ts for the two
 * verticals encoded as data today, lib/verticals/index.ts for
 * resolveVertical() (the pure resolution logic, safe for client import),
 * and components/providers/vertical-provider.tsx for how a deployment's
 * active vertical reaches client pages via useVertical().
 *
 * `key` values must match the control-panel's `projects.category` column
 * slugs verbatim: "hamburgueseria" | "pizzeria" | "sushi" | "panaderia" |
 * "cafeteria" | "otro".
 */

export type VerticalCategorySlug =
  | "hamburgueseria"
  | "pizzeria"
  | "sushi"
  | "panaderia"
  | "cafeteria"
  | "otro";

/**
 * How the order-building UI behaves for this vertical.
 * - "builder-wizard": today's burger flow — pick a base product, customize
 *   ingredients/meat-count/fries-count, add extras, optionally build combos.
 * - "piece-selector": e.g. sushi — pick pieces/rolls by count, no per-item
 *   ingredient customization.
 * - "size-crust-selector": e.g. pizza — pick a size + crust variant, then
 *   toppings.
 */
export type OrderFlow =
  | "builder-wizard"
  | "piece-selector"
  | "size-crust-selector";

/**
 * Labels for the 4 extra/variant categories that exist today as the
 * `extras.category` CHECK enum (extra/drink/fries/sides). Later phases may
 * replace this fixed 4-slot shape with a fully dynamic `variant_groups`
 * list; this is deliberately kept 1:1 with what already exists so Phase 0
 * introduces no new concepts, only names today's hardcoded strings.
 */
export interface VariantGroupLabels {
  extra: string;
  drink: string;
  fries: string;
  sides: string;
}

/** A page's Header title/subtitle, as rendered today via <Header title=... subtitle=... />. */
export interface PageCopy {
  title: string;
  subtitle: string;
}

export interface VerticalLabels {
  /** Singular noun for the main sellable product, e.g. "hamburguesa". */
  productNoun: string;
  /** Plural of productNoun, e.g. "hamburguesas". */
  productNounPlural: string;
  variantGroupLabels: VariantGroupLabels;
  /** Copy for the pages that are vertical-flavored today. */
  pages: {
    menu: PageCopy;
    precios: PageCopy;
    extras: PageCopy;
    combos: PageCopy;
    rendimiento: PageCopy;
  };
}

export interface VerticalFeatureFlags {
  /** Whether this vertical supports bundling items into combos (combos/combo_slots/combo_slots_rules). */
  hasCombos: boolean;
  /** Whether a product's default "meat" variant can be swapped for a veggie substitute (today: burger patty -> veggie patty). */
  hasVeggieSubstitution: boolean;
  /** Whether a product can be split into two halves with different variants (e.g. half-and-half pizza). Not used by any vertical yet. */
  hasHalfAndHalf: boolean;
}

/** One option inside a seed variant group, for future clone-seeding of a new deployment. */
export interface SeedVariantOption {
  name: string;
  /** Price delta relative to the product base price, if any. */
  priceDelta?: number;
}

/** One seed variant group (mirrors today's extras.category buckets). */
export interface SeedVariantGroup {
  key: keyof VariantGroupLabels | (string & {});
  label: string;
  options: SeedVariantOption[];
}

/** One seed menu category (mirrors today's `categories` table shape). */
export interface SeedCategory {
  name: string;
  type: string;
}

/**
 * Default data to seed a brand-new deployment of this vertical. Not
 * consumed by any code yet — this documents the shape a future
 * clone-seeding script would read.
 */
export interface VerticalSeedTemplate {
  categories: SeedCategory[];
  variantGroups: SeedVariantGroup[];
}

/**
 * One stat tile on the /rendimiento page's "Unidades vendidas" card, as
 * hardcoded today in app/(dashboard)/rendimiento/page.tsx and computed by
 * useProductStats in lib/hooks/orders/use-orders-history.ts.
 */
export interface RendimientoTile {
  /** Key into the ProductStats-shaped aggregation result, e.g. "totalMedallones". */
  key: string;
  /** Display label, e.g. "Medallones". */
  label: string;
  emoji: string;
  /**
   * Which variant-group label(s) (or "burger"/"combo" pseudo-groups) roll
   * up into this tile's count. Mirrors the category checks in
   * useProductStats today (e.g. extras.category === "extra" contributes to
   * the "Medallones" tile for the burger vertical).
   */
  rollsUpFrom: string[];
}

export interface RendimientoConfig {
  tiles: RendimientoTile[];
}

/**
 * Full configuration for one vertical. One `VerticalDefinition` = one
 * business type Morfito can be deployed as.
 */
export interface VerticalDefinition {
  /** Must match a control-panel `projects.category` slug — see VerticalCategorySlug. */
  key: VerticalCategorySlug;
  displayName: string;
  labels: VerticalLabels;
  orderFlow: OrderFlow;
  features: VerticalFeatureFlags;
  seedTemplate: VerticalSeedTemplate;
  rendimiento: RendimientoConfig;
}
