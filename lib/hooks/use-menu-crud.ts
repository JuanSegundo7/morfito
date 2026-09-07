"use client";

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Burger, Extra } from "@/lib/types";
import { toast } from "sonner";

// ==================== BURGERS ====================

export function useAllBurgers() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["all-burgers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("burgers")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Burger[];
    },
  });
}

export function useCreateBurger() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (burger: Omit<Burger, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("burgers")
        .insert(burger)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-burgers"] });
      queryClient.invalidateQueries({ queryKey: ["burgers"] });
    },
    onError: (error: any) => {
      console.error("Error creating burger:", error);
      toast.error("Error al crear hamburguesa: " + error.message);
    },
  });
}

export function useUpdateBurger() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, ...burger }: Partial<Burger> & { id: string }) => {
      const { data, error } = await supabase
        .from("burgers")
        .update(burger)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-burgers"] });
      queryClient.invalidateQueries({ queryKey: ["burgers"] });
    },
    onError: (error: any) => {
      console.error("Error updating burger:", error);
      toast.error("Error al actualizar hamburguesa: " + error.message);
    },
  });
}

export function useDeleteBurger() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log("🗑️ Attempting to delete burger:", id);

      const { error } = await supabase.from("burgers").delete().eq("id", id);

      if (error) {
        console.error("❌ Delete error:", error);

        // Si hay error de foreign key constraint
        if (error.code === "23503") {
          throw new Error(
            "No se puede eliminar esta hamburguesa porque está siendo usada en pedidos o combos",
          );
        }
        throw error;
      }

      console.log("✅ Burger deleted successfully");
    },
    onSuccess: () => {
      console.log("🔄 Invalidating queries...");
      queryClient.invalidateQueries({ queryKey: ["all-burgers"] });
      queryClient.invalidateQueries({ queryKey: ["burgers"] });
    },
    onError: (error: any) => {
      console.error("❌ Error in onError:", error);
      toast.error(error.message || "Error al eliminar hamburguesa");
    },
  });
}

// ==================== EXTRAS ====================

export function useAllExtras() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["all-extras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extras")
        .select("*")
        .order("category")
        .order("name");

      if (error) throw error;
      return data as Extra[];
    },
  });
}

export function useCreateExtra() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (extra: Omit<Extra, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("extras")
        .insert(extra)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-extras"] });
      queryClient.invalidateQueries({ queryKey: ["extras"] });
    },
    onError: (error: any) => {
      console.error("Error creating extra:", error);
      toast.error("Error al crear extra: " + error.message);
    },
  });
}

export function useUpdateExtra() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, ...extra }: Partial<Extra> & { id: string }) => {
      const { data, error } = await supabase
        .from("extras")
        .update(extra)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-extras"] });
      queryClient.invalidateQueries({ queryKey: ["extras"] });
    },
    onError: (error: any) => {
      console.error("Error updating extra:", error);
      toast.error("Error al actualizar extra: " + error.message);
    },
  });
}

export function useDeleteExtra() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log("🗑️ Attempting to delete extra:", id);

      const { error } = await supabase.from("extras").delete().eq("id", id);

      if (error) {
        console.error("❌ Delete error:", error);

        // Si hay error de foreign key constraint
        if (error.code === "23503") {
          throw new Error(
            "No se puede eliminar este extra porque está siendo usado en pedidos",
          );
        }
        throw error;
      }

      console.log("✅ Extra deleted successfully");
    },
    onSuccess: () => {
      console.log("🔄 Invalidating queries...");
      queryClient.invalidateQueries({ queryKey: ["all-extras"] });
      queryClient.invalidateQueries({ queryKey: ["extras"] });
    },
    onError: (error: any) => {
      console.error("❌ Error in onError:", error);
      toast.error(error.message || "Error al eliminar extra");
    },
  });
}
