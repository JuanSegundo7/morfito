import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Combo,
  ComboSlotRule,
  ComboWithSlots,
  CreateComboPayload,
} from "../types/combo-types";

const supabase = createClient();

/* ---------- QUERIES ---------- */

export function useAllCombos() {
  return useQuery({
    queryKey: ["combos-full"], // ✅ Mantener consistente
    queryFn: async (): Promise<ComboWithSlots[]> => {
      const { data, error } = await supabase
        .from("combos")
        .select(
          `
  id,
  name,
  price,
  description,
  is_available,
  created_at,
  combo_slots (
    id,
    combo_id,
    slot_type,
    quantity,
    required,
    default_meat_quantity,
    created_at,
    combo_slots_rules (
      id,
      rule_type,
      rule_value
    )
  )
`,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((combo) => ({
        id: combo.id,
        name: combo.name,
        description: combo.description,
        price: combo.price,
        is_available: combo.is_available,
        created_at: combo.created_at,
        slots: combo.combo_slots.map((slot) => {
          const minRule = slot.combo_slots_rules.find(
            (r) => r.rule_type === "min_quantity",
          );

          const maxRule = slot.combo_slots_rules.find(
            (r) => r.rule_type === "max_quantity",
          );

          const allowedMeatRule = slot.combo_slots_rules.find(
            (r) => r.rule_type === "allowed_meat_count",
          );

          const noFriesRule = slot.combo_slots_rules.find(
            (r) => r.rule_type === "no_fries",
          );

          return {
            id: slot.id,
            combo_id: combo.id,
            slot_type: slot.slot_type,
            quantity: slot.quantity,
            required: slot.required,
            default_meat_quantity: slot.default_meat_quantity,
            created_at: slot.created_at,

            rules: {
              min_quantity: minRule ? Number(minRule.rule_value) : 0,
              max_quantity: maxRule
                ? Number(maxRule.rule_value)
                : slot.quantity,
              allowed_meat_count: allowedMeatRule
                ? JSON.parse(allowedMeatRule.rule_value)
                : undefined,
              no_fries: noFriesRule?.rule_value === "true" ? true : undefined,
            },
          };
        }),
      }));
    },
  });
}

/* ---------- MUTATIONS ---------- */

export function useCreateCombo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<Combo, "id">) => {
      const { error } = await supabase.from("combos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combos-full"] }); // ✅ Corregir
      qc.invalidateQueries({ queryKey: ["combos"] });
    },
  });
}

export function useUpdateCombo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Pick<Combo, "id" | "name" | "price" | "is_available">) => {
      const { error } = await supabase
        .from("combos")
        .update(payload)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combos-full"] }); // ✅ Corregir
      qc.invalidateQueries({ queryKey: ["combos"] });
    },
  });
}

export function useDeleteCombo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log("🗑️ Attempting to delete combo:", id);

      const { error } = await supabase.from("combos").delete().eq("id", id);

      if (error) {
        console.error("❌ Delete error:", error);

        // Si hay error de foreign key constraint
        if (error.code === "23503") {
          throw new Error(
            "No se puede eliminar este combo porque está siendo usado en pedidos",
          );
        }
        throw error;
      }

      console.log("✅ Combo deleted successfully");
    },
    onSuccess: () => {
      console.log("🔄 Invalidating queries...");
      qc.invalidateQueries({ queryKey: ["combos-full"] }); // ✅ Corregir
      qc.invalidateQueries({ queryKey: ["combos"] });
    },
    onError: (error: any) => {
      console.error("❌ Error in onError:", error);
      toast.error(error.message || "Error al eliminar combo");
    },
  });
}

/* ===================================================== */
/* ========== CREATE COMBO + SLOTS + RULES ============== */
/* ===================================================== */

export function useCreateComboWithSlots() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateComboPayload) => {
      /* ---------- 1. CREATE COMBO ---------- */

      const { data: combo, error: comboError } = await supabase
        .from("combos")
        .insert({
          name: payload.name,
          price: payload.price,
          is_available: payload.is_available,
        })
        .select()
        .single();

      if (comboError) throw comboError;

      /* ---------- 2. CREATE SLOTS + RULES ---------- */

      for (const slot of payload.slots) {
        const { data: slotRow, error: slotError } = await supabase
          .from("combo_slots")
          .insert({
            combo_id: combo.id,
            slot_type: slot.slot_type,
            quantity: slot.quantity,
            default_meat_quantity: slot.default_meat_quantity ?? null,
          })
          .select()
          .single();

        if (slotError) throw slotError;

        if (slot.rules?.length) {
          const rules: Omit<ComboSlotRule, "id" | "created_at">[] =
            slot.rules.map((rule) => ({
              combo_slot_id: slotRow.id,
              rule_type: rule.rule_type,
              rule_value: rule.rule_value,
            }));

          const { error: rulesError } = await supabase
            .from("combo_slots_rules")
            .insert(rules);

          if (rulesError) throw rulesError;
        }
      }

      return combo;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combos-full"] }); // ✅ Corregir
      qc.invalidateQueries({ queryKey: ["combos"] });
      qc.invalidateQueries({ queryKey: ["combo-slots"] });
      qc.invalidateQueries({ queryKey: ["combo-slot-rules"] });
    },
  });
}

/* ===================================================== */
/* ========== UPDATE COMBO + SLOTS + RULES ============= */
/* ===================================================== */

export function useUpdateComboWithSlots() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateComboPayload & { id: string }) => {
      const { id, ...rest } = payload;

      /* 1. Actualizar campos básicos del combo */
      const { error: comboError } = await supabase
        .from("combos")
        .update({ name: rest.name, price: rest.price, is_available: rest.is_available })
        .eq("id", id);

      if (comboError) throw comboError;

      /* 2. Eliminar slots existentes (las reglas se borran en cascada) */
      const { error: deleteError } = await supabase
        .from("combo_slots")
        .delete()
        .eq("combo_id", id);

      if (deleteError) throw deleteError;

      /* 3. Recrear slots y reglas */
      for (const slot of rest.slots) {
        const { data: slotRow, error: slotError } = await supabase
          .from("combo_slots")
          .insert({
            combo_id: id,
            slot_type: slot.slot_type,
            quantity: slot.quantity,
            default_meat_quantity: slot.default_meat_quantity ?? null,
          })
          .select()
          .single();

        if (slotError) throw slotError;

        if (slot.rules?.length) {
          const rules: Omit<ComboSlotRule, "id" | "created_at">[] = slot.rules.map(
            (rule) => ({
              combo_slot_id: slotRow.id,
              rule_type: rule.rule_type,
              rule_value: rule.rule_value,
            }),
          );

          const { error: rulesError } = await supabase
            .from("combo_slots_rules")
            .insert(rules);

          if (rulesError) throw rulesError;
        }
      }
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["combos-full"] });
      qc.invalidateQueries({ queryKey: ["combos"] });
      qc.invalidateQueries({ queryKey: ["combo-slots"] });
      qc.invalidateQueries({ queryKey: ["combo-slot-rules"] });
    },
  });
}
