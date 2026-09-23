"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useBusinessName, useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import type { TicketLayout } from "@/lib/settings/ticket-layout";
import { TicketEditor } from "./ticket-editor";
import { TicketPreview } from "./ticket-preview";

const DOWNLOAD_BUCKET = "downloads";
const DOWNLOAD_PATH = "print-service/morfito-print-service.exe";

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold">
      {n}
    </span>
  );
}

export function ImpresoraTab() {
  const settings = useSettings();
  const businessName = useBusinessName();
  const updateSettings = useUpdateAppSettings();
  const [draft, setDraft] = useState<TicketLayout>(settings.ticket_layout);

  const handleSaveLayout = (layout: TicketLayout) => {
    updateSettings.mutate(
      { ticket_layout: layout },
      { onSuccess: () => toast.success("Formato del ticket guardado") },
    );
  };

  const handleDownload = () => {
    const supabase = createClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from(DOWNLOAD_BUCKET).getPublicUrl(DOWNLOAD_PATH);
    window.location.href = publicUrl;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Formato del ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-callout text-muted-foreground">
            Elegí qué se imprime, en qué orden y con qué opciones. Arrastrá los
            bloques para reordenarlos. Los cambios se aplican en la impresora en
            unos minutos, o al reiniciar el servicio de impresión.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <TicketEditor
              value={settings.ticket_layout}
              onSave={handleSaveLayout}
              isSaving={updateSettings.isPending}
              onDraftChange={setDraft}
            />
            <TicketPreview layout={draft} businessName={businessName} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Descargar el servicio de impresión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-callout text-muted-foreground">
            Es el programa que corre en la PC del local y conecta el dashboard
            con la impresora térmica. Hace falta instalarlo una vez por cada
            PC desde la que se vaya a imprimir.
          </p>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Descargar morfito-print-service.exe
          </Button>
          <p className="text-caption text-muted-foreground">
            Guardalo en <code className="font-mono">C:\morfito-print-service\</code> — es
            la carpeta que el resto de esta guía asume.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Cómo instalarlo y usarlo</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <StepNumber n={1} />
              <div>
                <p className="font-medium">Descargá y guardá el archivo</p>
                <p className="text-caption text-muted-foreground">
                  En <code className="font-mono">C:\morfito-print-service\</code>, en la
                  PC desde la que se va a imprimir.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={2} />
              <div>
                <p className="font-medium">Ejecutá morfito-print-service.exe</p>
                <p className="text-caption text-muted-foreground">
                  Windows probablemente muestre &ldquo;Windows protegió tu PC&rdquo; — es
                  porque el programa no está firmado digitalmente, no porque tenga un
                  problema. Hacé click en <strong>&ldquo;Más información&rdquo;</strong> y
                  después en <strong>&ldquo;Ejecutar de todas formas&rdquo;</strong>.
                  Dejalo abierto: mientras la ventana esté abierta, el servicio está
                  corriendo.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={3} />
              <div>
                <p className="font-medium">Mirá el ícono de impresora, arriba a la derecha</p>
                <p className="text-caption text-muted-foreground">
                  Con el servicio corriendo, aparece un ícono junto al botón de tema.
                  Rojo (&ldquo;Impresora desconectada&rdquo;) significa que el servicio no
                  está corriendo o no se pudo contactar. Gris (&ldquo;Elegir
                  impresora&rdquo;) significa que el servicio está activo pero todavía no
                  elegiste con cuál imprimir en esta PC.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={4} />
              <div>
                <p className="font-medium">Elegí la impresora</p>
                <p className="text-caption text-muted-foreground">
                  Hacé click en el ícono y elegí tu impresora de la lista. Si todavía no
                  está compartida en Windows, el sistema va a pedir aprobación —
                  aceptala. Cuando el ícono se pone verde (&ldquo;Impresora lista&rdquo;),
                  ya se puede imprimir tickets desde el dashboard.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={5} />
              <div className="space-y-2">
                <p className="font-medium">Si algo no funciona</p>
                <ul className="text-caption text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>
                    <strong>No aparece ninguna impresora:</strong> instalá el driver del
                    fabricante y conectala por USB antes de volver a abrir el panel.
                  </li>
                  <li>
                    <strong>Pide ejecutar como administrador:</strong> cerrá el programa
                    y volvé a abrirlo con click derecho → &ldquo;Ejecutar como
                    administrador&rdquo;.
                  </li>
                  <li>
                    <strong>Se canceló la aprobación de Windows:</strong> volvé a elegir
                    la impresora y aceptá el cuadro de Windows esta vez.
                  </li>
                  <li>
                    <strong>La impresora quedó &ldquo;no alcanzable&rdquo;:</strong> volvé
                    a seleccionarla desde el ícono — a veces alcanza con eso.
                  </li>
                </ul>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
