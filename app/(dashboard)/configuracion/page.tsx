"use client";

import { useState } from "react";
import { SlidersHorizontal, Palette, MessageSquare, MapPin, Printer } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings, useUpdateAppSettings, useBusinessName } from "@/lib/hooks/use-app-settings";
import { NegocioCard } from "@/components/configuracion/negocio-card";
import { PedidosCard } from "@/components/configuracion/pedidos-card";
import { AparienciaCard } from "@/components/configuracion/apariencia-card";
import { ImpresoraTab } from "@/components/configuracion/impresora-tab";
import { EnviosTab } from "@/components/configuracion/envios-tab";
import { TemplateEditor } from "@/components/configuracion/template-editor";
import { SAMPLE_ORDER } from "@/lib/settings/sample-order";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { formatOrderForDelivery } from "@/lib/utils/formatOrderDelivery";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";

// Settings port from jebbs-dashboard's configuracion/page.tsx (commit
// 4e430f7 + e05aab8), Phase 2 of the settings port plan. Deliberate
// deviations from jebbs, all confirmed before writing this file:
//
// 1. NO tours/nextstepjs. jebbs' page wired useNextStep()/currentTour to
//    force-switch to the "mensajes" tab when the "configuracion" guided
//    tour started, plus a HelpButton and an id="configuracion-tabs-list"
//    for the tour's querySelector to latch onto. Confirmed absent from this
//    repo: no "nextstepjs" in package.json, no components/onboarding/
//    directory. None of that ported.
// 2. 5 tabs (General, Envíos, Apariencia, Mensajes, Impresora), same as jebbs.
//    The Envíos panel is deliberately NOT forceMount: the polygon editor
//    converts pointer positions through the SVG's screen CTM, which a
//    force-mounted hidden panel would report as null/zero-sized. The Impresora
//    panel is not forceMount either.
// 3. ImpresoraTab downloads morfito-print-service.exe from the public
//    "downloads" Storage bucket ("print-service/morfito-print-service.exe").
export default function ConfiguracionPage() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();
  const businessName = useBusinessName();
  const [tab, setTab] = useState<"general" | "envios" | "apariencia" | "mensajes" | "impresora">("general");

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header title="Configuración" subtitle="Datos del negocio y mensajes" />

      <div className="flex-1 overflow-auto py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="rounded-full p-1">
              <TabsTrigger value="general" className="rounded-full px-6 text-subheadline gap-1.5">
                <SlidersHorizontal className="h-4 w-4" /> General
              </TabsTrigger>
              <TabsTrigger value="envios" className="rounded-full px-6 text-subheadline gap-1.5">
                <MapPin className="h-4 w-4" /> Envíos
              </TabsTrigger>
              <TabsTrigger value="apariencia" className="rounded-full px-6 text-subheadline gap-1.5">
                <Palette className="h-4 w-4" /> Apariencia
              </TabsTrigger>
              <TabsTrigger value="mensajes" className="rounded-full px-6 text-subheadline gap-1.5">
                <MessageSquare className="h-4 w-4" /> Mensajes
              </TabsTrigger>
              <TabsTrigger value="impresora" className="rounded-full px-6 text-subheadline gap-1.5">
                <Printer className="h-4 w-4" /> Impresora
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" className="mt-6 space-y-6">
            <NegocioCard />
            <PedidosCard />
          </TabsContent>

          <TabsContent value="envios" className="mt-6">
            <EnviosTab />
          </TabsContent>

          <TabsContent value="apariencia" className="mt-6">
            <AparienciaCard />
          </TabsContent>

          {/* forceMount: TemplateEditor guarda un `draft` local sin guardar
              (template-editor.tsx) que protege contra que un refetch en
              background pise una plantilla a medio escribir. Sin
              forceMount, Radix desmonta este panel al cambiar de pestaña y
              ese draft se pierde en silencio. Portado de jebbs-dashboard por
              esta razón exclusivamente -- acá NO hay tour que dependa de
              que el panel esté en el DOM (ver nota 1 arriba). */}
          <TabsContent
            value="mensajes"
            forceMount
            className="mt-6 space-y-6 data-[state=inactive]:hidden"
          >
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Mensaje de WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  label="whatsapp"
                  value={settings.whatsapp_template}
                  defaultTemplate={DEFAULT_APP_SETTINGS.whatsapp_template}
                  rows={20}
                  requiredVars={["items", "total"]}
                  renderPreview={(draft) =>
                    formatOrderForWhatsapp(SAMPLE_ORDER, { ...settings, whatsapp_template: draft }, businessName)
                  }
                  onSave={(next) => updateSettings.mutate({ whatsapp_template: next })}
                  isSaving={updateSettings.isPending}
                />
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Mensaje para el repartidor</CardTitle>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  label="delivery"
                  value={settings.delivery_template}
                  defaultTemplate={DEFAULT_APP_SETTINGS.delivery_template}
                  rows={10}
                  renderPreview={(draft) =>
                    formatOrderForDelivery(SAMPLE_ORDER, { ...settings, delivery_template: draft }, businessName)
                  }
                  onSave={(next) => updateSettings.mutate({ delivery_template: next })}
                  isSaving={updateSettings.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="impresora" className="mt-6">
            <ImpresoraTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
