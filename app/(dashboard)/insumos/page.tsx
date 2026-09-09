import { redirect } from "next/navigation";

/**
 * finanzas-gastos-recetas PR1: /insumos moved into the Insumos tab of the
 * new /finanzas shell (see components/finanzas/insumos-tab.tsx). This route
 * is kept only so old bookmarks/links to /insumos keep working — it's a
 * server-side redirect() (temporary/307), not a next.config.mjs redirects()
 * entry (this repo has no such block today, and adding one would create an
 * invisible second routing surface) and not a client-side useEffect
 * (would flash a blank frame and does nothing for a non-JS request).
 * Gating: this path is still listed in SERVICE_NAV_HREFS.stock_management
 * (lib/service-nav-map.ts) alongside /finanzas, so middleware.ts redirects
 * an ungated user to /plan before this redirect logic ever runs.
 */
export default function InsumosPage() {
  redirect("/finanzas?tab=insumos");
}
