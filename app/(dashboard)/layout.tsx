import type React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { MotionProvider } from "@/components/providers/motion-provider";

import { Analytics } from "@vercel/analytics/next";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { BillingBlock } from "@/components/billing/billing-block";
import { getEntitlements } from "@/lib/entitlements";
import { resolveVertical } from "@/lib/verticals";
import { VerticalProvider } from "@/components/providers/vertical-provider";
import { ServicesProvider } from "@/components/providers/services-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layer 0 billing gate: block business features when the account is known
  // to be past-due/suspended/without a subscription. This never touches
  // login/auth — app/login/page.tsx lives outside this layout, and the
  // "unknown" (unreachable/misconfigured control-panel) case fails open below
  // so an unrelated ops/network problem never locks out a paying customer.
  const entitlements = await getEntitlements();
  const isBlocked =
    entitlements.status === "known" && entitlements.data.access.allowed === false;

  // Active service keys drive sidebar gating (see lib/service-nav-map.ts).
  // `null` means "don't gate anything" — used for the "unknown" entitlements
  // state so a control-panel outage never hides nav items a user relies on.
  const activeServiceKeys =
    entitlements.status === "known"
      ? entitlements.data.services.filter((service) => service.active).map((service) => service.key)
      : null;

  // Resolve once here (reusing the entitlements fetch above, not a second
  // one) and hand it down via context so client pages read it with
  // useVertical() instead of each needing their own server round-trip.
  const vertical = resolveVertical(
    entitlements.status === "known" ? entitlements.data.project.category : undefined,
  );

  return (
    <ThemeProvider>
      <QueryProvider>
        <ServicesProvider activeServiceKeys={activeServiceKeys}>
        <VerticalProvider vertical={vertical}>
          {isBlocked && entitlements.status === "known" ? (
            <BillingBlock
              reason={entitlements.data.access.reason as "past_due" | "suspended" | "no_subscription"}
              billing={entitlements.data.billing}
            />
          ) : (
            // MotionProvider envuelve solo el arbol que puede tener motion.*
            // (sidebar, kanban) -- Toaster/Analytics quedan afuera a proposito,
            // mismo criterio que ya separa a Toaster de SidebarProvider abajo.
            <MotionProvider>
              <SidebarProvider defaultOpen={false}>
                <SidebarLayout activeServiceKeys={activeServiceKeys}>{children}</SidebarLayout>
              </SidebarProvider>
            </MotionProvider>
          )}
          {/* Taxonomia de toast (regla de la casa):
              - toast.error   = lo pedido NO paso.
              - toast.warning = paso, pero un efecto secundario fallo -- puede
                requerir accion (ej: se guardo el gasto pero no se ajusto el
                stock).
              - toast.info    = paso; contexto que no se pidio.
              No usar error para una falla parcial, ni warning para una falla
              total -- son distinguibles a proposito. */}
          {/* Toaster afuera de SidebarProvider a proposito (jebbs-dashboard@
              b40eafa): sonner no esta aplicando su propio position:fixed en
              este arbol, y mientras esta seccion quedaba adentro del flex de
              sidebar-wrapper, contaba como un tercer hijo en fila y estiraba
              TODO el layout mas alla del viewport -- scroll doble en cada
              pagina. Afuera del SidebarProvider, aunque el position:fixed
              siga sin aplicar, ya no puede volver a inflar ese contenedor. */}
          <Toaster
            richColors
            position="top-right"
            theme="dark"
            toastOptions={{
              classNames: {
                toast: "material-thick !text-foreground",
              },
            }}
          />
          <Analytics />
        </VerticalProvider>
        </ServicesProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
