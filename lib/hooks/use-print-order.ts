"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Exportado: use-printers.ts (hook hermano, para el popover de impresoras)
// lo reusa para no desincronizar un segundo "http://localhost:3001" a mano.
export const PRINT_SERVICE_URL = "http://localhost:3001";

// Hook para verificar disponibilidad del servicio
export function usePrintServiceStatus() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["print-service-status"],
    queryFn: async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${PRINT_SERVICE_URL}/health`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) return { isAvailable: false };

        const data = await res.json();
        return {
          isAvailable: true,
          version: data.version,
          printerConfigured: Boolean(data.printerConfigured),
          selectedPrinter: data.selectedPrinter as string | null,
        };
      } catch (error) {
        return { isAvailable: false };
      }
    },
    refetchInterval: 30000, // Verificar cada 30 segundos
    retry: false,
  });

  return {
    isAvailable: data?.isAvailable ?? false,
    version: data?.version,
    printerConfigured: data?.printerConfigured ?? false,
    selectedPrinter: data?.selectedPrinter ?? null,
    isChecking: isLoading,
    refetch,
  };
}

// Hook principal de impresión
export function usePrintOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Verificar que el servicio esté disponible
      const statusData = queryClient.getQueryData<{ isAvailable: boolean }>([
        "print-service-status",
      ]);

      if (!statusData?.isAvailable) {
        throw new Error(
          "El servicio de impresión no está disponible. Asegúrate de que print-service.exe esté corriendo.",
        );
      }

      // Intentar imprimir
      const res = await fetch(`${PRINT_SERVICE_URL}/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error al imprimir el pedido");
      }

      return res.json();
    },
    onSuccess: () => {
      // Opcional: mostrar notificación de éxito
      console.log("✅ Pedido impreso correctamente");
    },
    onError: (error: Error) => {
      // Logging de errores
      console.error("❌ Error al imprimir:", error.message);
    },
  });
}
