import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { FinanzasTabs } from "@/components/finanzas/finanzas-tabs";

/**
 * /finanzas — gated by the `stock_management` service key via
 * lib/service-nav-map.ts (SERVICE_NAV_HREFS), same as /insumos was before
 * this PR. Gating is enforced by middleware.ts (redirects to /plan when the
 * service is inactive) and by components/layout/sidebar.tsx (hides the nav
 * link) — this page component itself does not re-check access, matching
 * every other service-gated page in this repo.
 *
 * Suspense is required here because FinanzasTabs reads `useSearchParams()`
 * (the `?tab=` query param) — without a Suspense boundary around a client
 * component that calls useSearchParams, Next.js errors during static
 * prerendering of this route.
 */
export default function FinanzasPage() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header title="Finanzas" subtitle="Resumen financiero, gastos, insumos y recetas" />

      <Suspense fallback={null}>
        <FinanzasTabs />
      </Suspense>
    </div>
  );
}
