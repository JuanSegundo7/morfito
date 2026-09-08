"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { usePrintServiceStatus } from "@/lib/hooks/use-print-order";
import {
  usePrinters,
  useSelectPrinter,
  type PrinterInfo,
  type PrinterStatus,
} from "@/lib/hooks/use-printers";

const STATUS_DOT: Record<PrinterStatus, string> = {
  online: "bg-green-500",
  offline: "bg-zinc-400",
  error: "bg-destructive",
};

// Sección "Impresora" del popover -- vive acá adentro (no un componente
// aparte en otro archivo) porque no tiene sentido fuera de este popover, y
// solo pide datos mientras el popover está abierto (`enabled: open`).
function PrinterPicker({ open }: { open: boolean }) {
  const { data, isLoading, isError } = usePrinters({ enabled: open });
  const selectPrinter = useSelectPrinter();

  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (isError) {
    return (
      <p className="text-caption text-muted-foreground">
        No se pudo consultar las impresoras de esta PC.
      </p>
    );
  }

  const printers = data?.printers ?? [];

  // Lista vacía: el único caso genuinamente no automatizable -- no hay
  // impresora que ofrecer, hace falta instalar un driver primero.
  if (printers.length === 0) {
    return (
      <div className="bg-muted p-3 rounded-md space-y-2">
        <p className="text-caption font-medium">No se encontró ninguna impresora</p>
        <ol className="text-caption space-y-1 list-decimal list-inside text-muted-foreground">
          <li>Instalá el driver del fabricante de la impresora</li>
          <li>Conectala por USB</li>
          <li>Volvé a abrir este panel</li>
        </ol>
      </div>
    );
  }

  // Si la impresora guardada ya no aparece en el discovery actual (se
  // desinstaló, se le cambió el nombre en Windows, etc.), no se le pasa ese
  // valor al Select -- Radix no tiene con qué resolver un label para un
  // value sin SelectItem correspondiente y termina mostrando la caja vacía
  // en vez de caer al placeholder. Mejor mostrar "Elegir impresora" que una
  // selección fantasma.
  const rawSelectedName = data?.selected?.name;
  const selectedName = printers.some((p) => p.name === rawSelectedName)
    ? rawSelectedName
    : undefined;
  const lastError = selectPrinter.isError
    ? (selectPrinter.error as { code?: string; message?: string })
    : null;

  function handleSelect(name: string) {
    const toastId = toast.loading("Configurando impresora…");
    selectPrinter.mutate(name, {
      onSuccess: (result) => {
        toast.dismiss(toastId);
        if (!result.reachable) {
          toast.warning(
            `"${name}" quedó compartida, pero todavía no se pudo confirmar que esté alcanzable.`,
          );
        } else if (result.printer.status === "offline") {
          toast.info(`"${name}" seleccionada. Ojo, aparece desconectada ahora mismo.`);
        } else {
          toast.success(`"${name}" configurada correctamente.`);
        }
      },
      onError: (err: any) => {
        toast.dismiss(toastId);
        if (err?.code === "NOT_ELEVATED") {
          toast.error(
            "Hace falta ejecutar el servicio como administrador para compartir esta impresora.",
          );
        } else if (err?.code === "UAC_CANCELLED") {
          toast.error("Se canceló la aprobación de Windows.");
        } else {
          toast.error(err?.message ?? "No se pudo configurar la impresora.");
        }
      },
    });
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={selectedName}
        onValueChange={handleSelect}
        disabled={selectPrinter.isPending}
      >
        <SelectTrigger className="w-full">
          {selectPrinter.isPending ? (
            <span className="flex items-center gap-2 text-caption text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Configurando impresora…
            </span>
          ) : (
            <SelectValue placeholder="Elegir impresora" />
          )}
        </SelectTrigger>
        <SelectContent>
          {printers.map((printer: PrinterInfo) => (
            <SelectItem key={printer.name} value={printer.name}>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[printer.status]}`}
                />
                {printer.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {data?.elevated === false && (
        <p className="text-caption text-muted-foreground">
          Si la impresora no está compartida todavía, Windows va a pedir aprobación.
        </p>
      )}

      {lastError && (
        <p className="text-caption text-destructive">
          {lastError.code === "NOT_ELEVATED"
            ? "Cerrá el servicio y volvé a abrirlo con \"Ejecutar como administrador\", después probá de nuevo."
            : lastError.message}
        </p>
      )}
    </div>
  );
}

export function PrintServiceIndicator() {
  const {
    isAvailable,
    version,
    printerConfigured,
    selectedPrinter,
    isChecking,
    refetch,
  } = usePrintServiceStatus();
  const [open, setOpen] = useState(false);

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
      <Popover open={open} onOpenChange={setOpen}>
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
                <li>Abre: C:\morfito-print-service\</li>
                <li>Ejecuta: morfito-print-service.exe</li>
                <li>Verifica que esté corriendo</li>
              </ol>
            </div>

            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span>localhost:3001</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Reintentar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Servicio activo, pero todavía sin impresora elegida -- estado propio,
  // no lo colapsamos con "Impresora lista": son problemas distintos, y
  // avisar acá es justo el punto de esta feature.
  if (!printerConfigured) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Badge variant="secondary" className="gap-2 cursor-pointer">
            <Printer className="h-3 w-3" />
            Elegir impresora
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-subheadline">Servicio activo</h4>
              <p className="text-caption text-muted-foreground mt-1">
                Todavía no elegiste con qué impresora imprimir en esta PC.
              </p>
            </div>
            <PrinterPicker open={open} />
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge variant="default" className="gap-2 cursor-pointer bg-green-600">
          <CheckCircle className="h-3 w-3" />
          Impresora lista
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
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
            <div className="flex justify-between">
              <span>Impresora:</span>
              <span className="font-mono truncate max-w-40" title={selectedPrinter ?? undefined}>
                {selectedPrinter}
              </span>
            </div>
          </div>

          <PrinterPicker open={open} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
