"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePrintServiceStatus } from "@/lib/hooks/use-print-order";

export function PrintServiceIndicator() {
  const { isAvailable, version, isChecking } = usePrintServiceStatus();

  if (isChecking) {
    return (
      <Badge variant="outline" className="gap-2 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700">
        <Printer className="h-3 w-3 animate-pulse" />
        Verificando...
      </Badge>
    );
  }

  if (!isAvailable) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Badge variant="destructive" className="gap-2 cursor-pointer">
            <AlertCircle className="h-3 w-3" />
            Impresora desconectada
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-subheadline">
                  Servicio de impresión no disponible
                </h4>
                <p className="text-caption text-muted-foreground mt-1">
                  Para imprimir tickets, asegúrate de que el servicio esté
                  corriendo en tu PC.
                </p>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-md space-y-2">
              <p className="text-caption font-medium">Pasos para activar:</p>
              <ol className="text-caption space-y-1 list-decimal list-inside text-muted-foreground">
                <li>Abre: C:\jebbs-print-service\</li>
                <li>Ejecuta: jebbs-print-service.exe</li>
                <li>Verifica que esté corriendo</li>
              </ol>
            </div>

            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span>localhost:3001</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reintentar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge variant="default" className="gap-2 cursor-pointer bg-green-600">
          <CheckCircle className="h-3 w-3" />
          Impresora lista
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <h4 className="font-medium text-subheadline">Servicio activo</h4>
          </div>
          <div className="text-caption text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Estado:</span>
              <span className="text-green-600 font-medium">Conectado</span>
            </div>
            <div className="flex justify-between">
              <span>Puerto:</span>
              <span className="font-mono">3001</span>
            </div>
            {version && (
              <div className="flex justify-between">
                <span>Versión:</span>
                <span className="font-mono">{version}</span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
