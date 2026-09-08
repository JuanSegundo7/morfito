import type { VerticalDefinition } from "./types";

/**
 * The burger vertical, encoded as data.
 *
 * This is documentation-as-code of what Morfito already does today — every
 * label below was read from the actual pages/components, not guessed:
 *   - variant group labels: app/(dashboard)/extras/page.tsx `categoryLabels`
 *   - page titles/subtitles: the <Header title=... subtitle=... /> call in
 *     each of app/(dashboard)/{menu,precios,extras,combos,rendimiento}/page.tsx
 *   - rendimiento tiles: the "Unidades vendidas" card in
 *     app/(dashboard)/rendimiento/page.tsx, backed by useProductStats in
 *     lib/hooks/orders/use-orders-history.ts
 *   - veggie substitution: the "🌱 Veggie" toggle in
 *     components/orders/burger-item-card.tsx / SelectedBurger.isVeggie
 *   - combos: components/order-wizard/steps/combos-step.tsx +
 *     lib/hooks/use-combos.ts
 *
 * Resolved via lib/verticals/index.ts's resolveVertical() and read by
 * client pages through useVertical() (components/providers/
 * vertical-provider.tsx) — this is the fallback vertical whenever the
 * active category is unknown, missing, or unrecognized.
 */
export const burgerVertical: VerticalDefinition = {
  key: "hamburgueseria",
  displayName: "Hamburguesería",

  labels: {
    productNoun: "hamburguesa",
    productNounPlural: "hamburguesas",
    variantGroupLabels: {
      extra: "Extras",
      drink: "Bebidas",
      fries: "Papas",
      sides: "Acompañamientos",
    },
    pages: {
      menu: {
        title: "Menú",
        subtitle: "Administra las hamburguesas del menú",
      },
      precios: {
        title: "Precios",
        subtitle: "Configuración central de precios",
      },
      extras: {
        title: "Extras",
        subtitle: "Administra extras, bebidas, papas y acompañamientos",
      },
      combos: {
        title: "Combos",
        subtitle: "Creá y administrá combos reutilizando items existentes",
      },
      rendimiento: {
        title: "Rendimiento",
        subtitle: "Análisis de ventas",
      },
    },
  },

  orderFlow: "builder-wizard",

  features: {
    hasCombos: true,
    hasVeggieSubstitution: true,
    hasHalfAndHalf: false,
  },

  // Default categories/variant groups for future clone-seeding of a new
  // burger-vertical deployment. Not consumed by any code yet.
  seedTemplate: {
    categories: [
      { name: "Hamburguesas", type: "burger" },
      { name: "Extras", type: "extra" },
      { name: "Bebidas", type: "drink" },
      { name: "Papas", type: "fries" },
    ],
    variantGroups: [
      { key: "extra", label: "Extras", options: [] },
      { key: "drink", label: "Bebidas", options: [] },
      { key: "fries", label: "Papas", options: [] },
      { key: "sides", label: "Acompañamientos", options: [] },
    ],
  },

  // Mirrors the exact tiles/emojis/order hardcoded today in
  // app/(dashboard)/rendimiento/page.tsx's "Unidades vendidas" card.
  rendimiento: {
    tiles: [
      { key: "totalBurgers", label: "Burgers", emoji: "🍔", rollsUpFrom: ["burger"] },
      { key: "totalCombos", label: "Combos", emoji: "🎁", rollsUpFrom: ["combo"] },
      { key: "totalMedallones", label: "Medallones", emoji: "🥩", rollsUpFrom: ["extra"] },
      { key: "totalFries", label: "Papas Fritas", emoji: "🍟", rollsUpFrom: ["fries"] },
      { key: "totalSides", label: "Acompañamientos", emoji: "🍗", rollsUpFrom: ["sides"] },
      { key: "totalDrinks", label: "Bebidas", emoji: "🥤", rollsUpFrom: ["drink"] },
    ],
  },
};
