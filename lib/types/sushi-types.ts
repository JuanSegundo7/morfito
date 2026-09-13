// ============================================
// SUSHI ORDER-WIZARD TYPES — sibling to combo-types.ts's SelectedBurger,
// for the "piece-selector" orderFlow (see lib/verticals/types.ts's
// OrderFlow and lib/verticals/sushi.ts). One SelectedSushiItem = one line
// item in the order wizard's sushi selection step
// (components/order-wizard/steps/sushi-step.tsx), analogous to
// SelectedBurger for the "builder-wizard" flow's BurgersStep.
// ============================================

import { Burger } from ".";

export interface SelectedSushiItem {
  id: string;
  /**
   * `Burger` is the order wizard's existing generic "sellable product"
   * shape — see lib/hooks/use-products.ts's useAvailableProducts doc
   * comment ("deliberately NOT Product/AddonProduct... SHAPE their results
   * identically to the Burger/Extra interfaces the rest of the order
   * wizard already consumes"). For a sushi deployment this is literally a
   * roll, not a burger; kept as `Burger` rather than introducing a new
   * per-vertical product type so this plugs directly into the same
   * `availableProducts` list the wizard already fetches via
   * useAvailableProducts() — no new data-fetching hook needed, since one
   * Morfito deployment serves exactly one vertical and `products` already
   * only contains that vertical's own items.
   */
  product: Burger;
  quantity: number;
  variantOptionId: string | null;
  variantOptionLabel: string | null;
  pieceCount: number | null;
  /**
   * Resolved unit price. Defaults to `product.base_price` when the item is
   * first added (before the user has touched the "Piezas" toggle — see
   * components/order-wizard/adapters/sushi-piece-selector.tsx's
   * onSelectionChange, which only fires on user interaction, not on
   * mount), then becomes SushiPieceSelection.totalPrice (base_price + the
   * selected option's price_delta) once a piece-count option is chosen.
   */
  unitPrice: number;
}
