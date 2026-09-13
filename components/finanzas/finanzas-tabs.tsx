"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InsumosTab } from "@/components/finanzas/insumos-tab";
import { RecetasTab } from "@/components/finanzas/recetas-tab";
import { GastosTab } from "@/components/finanzas/gastos-tab";
import { ResumenTab } from "@/components/finanzas/resumen-tab";

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
 * All four tabs render real content as of PR6.
 *
 * D9 (design.md): Resumen's `<TabsContent>` mounts `<ResumenTab />` behind
 * an explicit `activeTab === "resumen" &&` guard instead of relying on
 * Radix's own default unmount-when-inactive behavior. Radix already does
 * that today, but that's an *implicit* guarantee one `forceMount` prop away
 * from silently re-enabling ResumenTab's analytics query on every page load
 * (e.g. if someone later adds a tab-crossfade animation). NEVER add
 * `forceMount` to any `TabsContent` in this file.
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
      <TabsList className="mx-4 mt-4 w-fit md:mx-0">
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="gastos">Gastos</TabsTrigger>
        <TabsTrigger value="insumos">Insumos</TabsTrigger>
        <TabsTrigger value="recetas">Recetas</TabsTrigger>
      </TabsList>

      <TabsContent value="resumen" className="flex flex-1 flex-col overflow-hidden">
        {activeTab === "resumen" && <ResumenTab />}
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
