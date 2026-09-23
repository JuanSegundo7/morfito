"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { DeliveryZone } from "@/lib/types";

export function useDeliveryZones() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["delivery-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as DeliveryZone[];
    },
  });
}

export function useCreateDeliveryZone() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      zone: Pick<DeliveryZone, "name" | "fee"> &
        Partial<Pick<DeliveryZone, "description" | "sort_order" | "is_active">>,
    ) => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .insert(zone)
        .select()
        .single();

      if (error) throw error;
      return data as DeliveryZone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (error: any) => {
      console.error("Error al crear la zona de envío:", error);
      toast.error("Error al crear la zona de envío: " + error.message);
    },
  });
}

export function useUpdateDeliveryZone() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<DeliveryZone> & { id: string }) => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as DeliveryZone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (error: any) => {
      console.error("Error al actualizar la zona de envío:", error);
      toast.error("Error al actualizar la zona de envío: " + error.message);
    },
  });
}

// No hay mutación de borrado: las zonas solo se desactivan
// (is_active = false). orders.delivery_zone_id referencia esta tabla sin
// cascade, así que un DELETE sobre una zona usada en algún pedido fallaría
// en la DB — ver scripts/049-delivery-zones.sql.
export function useDeactivateDeliveryZone() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_zones")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (error: any) => {
      console.error("Error al desactivar la zona de envío:", error);
      toast.error("Error al desactivar la zona de envío: " + error.message);
    },
  });
}
