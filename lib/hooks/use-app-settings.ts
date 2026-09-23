"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";
import { useProjectName } from "@/components/providers/project-name-provider";
import { normalizeTicketLayout, type TicketLayout } from "@/lib/settings/ticket-layout";
import type { AppSettings } from "@/lib/types";

export function useAppSettings() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;
      return data as AppSettings;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Nunca undefined: degrada a los defaults sembrados por
// scripts/048-app-settings.sql mientras la query está en vuelo, si falló,
// o si la fila no existe todavía.
//
// ticket_layout se guarda crudo (jsonb nullable, scripts/051) pero acá se
// expone SIEMPRE normalizado: NULL, basura o una versión vieja/nueva del
// layout resuelven a un TicketLayout válido.
export type ResolvedAppSettings = Omit<AppSettings, "ticket_layout"> & {
  ticket_layout: TicketLayout;
};

export function useSettings(): ResolvedAppSettings {
  const { data } = useAppSettings();
  const raw = data ?? DEFAULT_APP_SETTINGS;
  const rawLayout = raw.ticket_layout;
  return useMemo(
    () => ({ ...raw, ticket_layout: normalizeTicketLayout(rawLayout) }),
    [raw, rawLayout],
  );
}

// Resuelve el nombre de negocio a mostrar (sidebar, login, mensajes de
// WhatsApp/delivery): un override explícito en /configuracion gana sobre el
// nombre real del proyecto que resuelve el control-panel para este
// deployment; "Morfito" (el fallback de useProjectName()) es el último
// recurso si ninguno de los dos está disponible. Ver scripts/048-app-
// settings.sql's "WHY business_name IS NULLABLE" y
// components/providers/project-name-provider.tsx para el porqué completo.
export function useBusinessName(): string {
  const settings = useSettings();
  const projectName = useProjectName();
  return settings.business_name ?? projectName;
}

export function useUpdateAppSettings() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const { data, error } = await supabase
        .from("app_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select()
        .single();

      if (error) throw error;
      return data as AppSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (error: any) => {
      console.error("Error al actualizar la configuración:", error);
      toast.error("Error al actualizar la configuración: " + error.message);
    },
  });
}
