"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRINT_SERVICE_URL } from "./use-print-order";

// Hook hermano de use-print-order.ts, no una extensión: ese archivo está en
// el camino caliente de toda la app (header, wizard, historial). La gestión
// de impresoras solo hace falta cuando el popover está abierto, así que
// vive en un módulo aparte que no se importa en ningún lado hasta entonces.

export type PrinterStatus = "online" | "offline" | "error";

export interface PrinterInfo {
  name: string;
  shareName: string | null;
  shared: boolean;
  status: PrinterStatus;
  isDefault: boolean;
}

export interface SelectedPrinter {
  name: string;
  shareName: string;
}

// Espejo de PrinterErrorCode en morfito-print-service/src/printer/errors.ts.
// Dos copias mantenidas a mano entre repos -- aceptable a esta escala,
// pero es el contrato que no puede desincronizarse: el frontend rama sobre
// `code`, nunca sobre `message` (los mensajes de Windows vienen localizados).
export type PrinterErrorCode =
  | "POWERSHELL_UNAVAILABLE"
  | "POWERSHELL_TIMEOUT"
  | "POWERSHELL_BAD_OUTPUT"
  | "NOT_ELEVATED"
  | "UAC_CANCELLED"
  | "PRINTER_NOT_FOUND"
  | "SHARE_FAILED"
  | "SHARE_UNREACHABLE"
  | "NO_PRINTER_SELECTED"
  | "UNKNOWN";

export interface PrinterApiError {
  code: PrinterErrorCode;
  message: string;
  detail?: string;
}

interface PrintersResponse {
  printers: PrinterInfo[];
  selected: SelectedPrinter | null;
  elevated: boolean;
}

export interface SelectPrinterResponse {
  selected: SelectedPrinter;
  printer: PrinterInfo;
  sharedByUs: boolean;
  reachable: boolean;
}

async function parseApiError(res: Response): Promise<PrinterApiError> {
  try {
    const body = await res.json();
    if (body?.error?.code) return body.error as PrinterApiError;
  } catch {
    // Respuesta sin JSON (servicio caído a mitad de camino, por ejemplo) --
    // cae al genérico de abajo.
  }
  return {
    code: "UNKNOWN",
    message: "Error inesperado del servicio de impresión.",
  };
}

// enabled atado al `open` del Popover -- sin esto, cada página de la app
// dispararía un spawn de PowerShell (~1.3-2.5s) al montar este hook.
export function usePrinters({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ["printers"],
    queryFn: async (): Promise<PrintersResponse> => {
      // 8000ms, no los 2000ms de /health: ese timeout es para un probe de
      // vida pura, este pedido de verdad consulta Win32_Printer (1.3-2.5s
      // medido). Copiar el timeout de /health lo rompería en cualquier PC
      // medianamente cargada.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${PRINT_SERVICE_URL}/printers`, {
          signal: controller.signal,
        });
        if (!res.ok) throw await parseApiError(res);
        return res.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useSelectPrinter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<SelectPrinterResponse> => {
      const res = await fetch(`${PRINT_SERVICE_URL}/printers/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw await parseApiError(res);
      return res.json();
    },
    onSuccess: () => {
      // Invalida las dos: la lista/selección del popover, y el estado de
      // /health que alimenta el badge del header -- reemplaza el
      // window.location.reload() que antes era la única forma de que el
      // badge reflejara una impresora recién elegida.
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      queryClient.invalidateQueries({ queryKey: ["print-service-status"] });
    },
  });
}
