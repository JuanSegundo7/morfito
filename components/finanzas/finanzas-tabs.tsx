"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InsumosTab } from "@/components/finanzas/insumos-tab";
import { RecetasTab } from "@/components/finanzas/recetas-tab";
import { GastosTab } from "@/components/finanzas/gastos-tab";

const FINANZAS_TABS = ["resumen", "gastos", "insumos", "recetas"] as const;
type FinanzasTab = (typeof FINANZAS_TABS)[number];

const DEFAULT_TAB: FinanzasTab = "resumen";

function isFinanzasTab(value: string | null): value is FinanzasTab {
  return FINANZAS_TABS.includes(value as FinanzasTab);
}

/**
 * finanzas-gastos-recetas PR1: /finanzas shell. Owns the `?tab=` query param
 * as the single source of truth for the active tab — read via
 * useSearchParams (hence this component requires a parent <Suspense>
 * boundary, see app/(dashboard)/finanzas/page.tsx) and written via
 * router.replace (never router.push) so switching tabs doesn't grow browser
 * history. An unknown/absent `tab` value falls back to "resumen" instead of
 * crashing or rendering blank.
 *
 * Insumos, Recetas and Gastos render real content as of PR4 — Resumen is
 * still a placeholder that PR6 replaces.
 */
export function FinanzasTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: FinanzasTab = isFinanzasTab(rawTab) ? rawTab : DEFAULT_TAB;

  const handleTabChange = (value: string) => {
    router.replace(`/finanzas?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="flex flex-1 flex-col overflow-hidden gap-0"
    >
      <TabsList className="mx-4 mt-4 w-fit md:mx-6">
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="gastos">Gastos</TabsTrigger>
        <TabsTrigger value="insumos">Insumos</TabsTrigger>
        <TabsTrigger value="recetas">Recetas</TabsTrigger>
      </TabsList>

      <TabsContent value="resumen" className="flex-1 overflow-auto p-6">
        <PlaceholderPane />
      </TabsContent>

      <TabsContent value="gastos" className="flex flex-1 flex-col overflow-hidden">
        <GastosTab />
      </TabsContent>

      <TabsContent value="insumos" className="flex flex-1 flex-col overflow-hidden">
        <InsumosTab />
      </TabsContent>

      <TabsContent value="recetas" className="flex flex-1 flex-col overflow-hidden">
        <RecetasTab />
      </TabsContent>
    </Tabs>
  );
}

/** Shared placeholder for the tabs not yet implemented (Resumen) — PR6
 * replaces this with real content. */
function PlaceholderPane() {
  return (
    <Card className="bg-card">
      <CardContent className="flex items-center justify-center py-16 text-center text-muted-foreground">
        Próximamente
      </CardContent>
    </Card>
  );
}
