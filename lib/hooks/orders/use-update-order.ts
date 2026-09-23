"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { OrderItemInput } from "./use-create-order";
import {
  applyStockDeduction,
  reverseStockDeduction,
  invalidateOrderStockQueries,
} from "@/lib/hooks/supplies/use-order-stock-sync";
import type { DeductionPlanItem } from "@/lib/services/stock-deduction";

export interface UpdateOrderPayload {
  customer_id: string | null;
  customer_name: string;
  customer_address_id: string | null;
  delivery_type: "delivery" | "pickup";
  delivery_fee: number;
  payment_method: "cash" | "transfer";
  discount_type: "amount" | "percentage" | "none" | null;
  discount_value: number;
  discount_amount: number;
  items: OrderItemInput[];
  notes: string | null;
  delivery_time?: string | null;
  // Cost/stock/finance porting, PR2 — mirrors CreateOrderInput's own
  // source/commission_rate/commission_amount fields (use-create-order.ts).
  source?: string | null;
  commission_rate?: number;
  commission_amount?: number;
  // Cost/stock/finance porting, PR3 — mirrors CreateOrderInput's own
  // price_adjustment field (use-create-order.ts).
  price_adjustment?: number;
}

export function useUpdateOrder() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: UpdateOrderPayload;
    }) => {
      // Cost/stock/finance porting, PR4 task 7a.8 (R2 guard): this
      // mutation deletes and re-inserts EVERY order_items row below,
      // regardless of the order's status — a completed order's stock
      // ledger (order_stock_movements, keyed by order_id+supply_id, not
      // order_item_id — see scripts/044-order-stock-movements.sql — so it
      // survives the delete+reinsert unharmed on its own) would otherwise
      // go silently stale against whatever the NEW item lines actually
      // consume. Currently dead-reachable in the UI (edit only ever lists
      // "new"/"ready" orders — see components/orders/orders-dashboard.tsx's
      // canEdit gate), but this guard must not be skipped just because
      // it's presently unreachable: reverse the existing ledger before the
      // delete below, then reapply a fresh plan (built from the NEW
      // payload.items — no DB round trip needed, see
      // lib/services/stock-deduction.ts's DeductionPlanItem shape) after
      // the new order_items/order_item_modifiers are inserted.
      const { data: existingOrder, error: existingOrderError } = await supabase
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();

      if (existingOrderError) throw existingOrderError;

      const wasCompleted = existingOrder?.status === "completed";

      if (wasCompleted) {
        await reverseStockDeduction(supabase, orderId);
      }

      // 1️⃣ Eliminar order_item_modifiers de los items viejos
      const { data: oldItems } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", orderId);

      if (oldItems && oldItems.length > 0) {
        const oldItemIds = oldItems.map((item) => item.id);
        await supabase
          .from("order_item_modifiers")
          .delete()
          .in("order_item_id", oldItemIds);
      }

      // 2️⃣ Eliminar order_items viejos
      await supabase.from("order_items").delete().eq("order_id", orderId);

      // 3️⃣ Calcular nuevo total
      const totalAmount = payload.items.reduce((sum, item) => {
        const extrasTotal = item.extras.reduce(
          (extSum, ext) => extSum + ext.subtotal,
          0,
        );
        return sum + item.subtotal + extrasTotal;
      }, 0);

      // Cost/stock/finance porting, PR2: commission subtracted the same way
      // discount_amount already is — see use-create-order.ts's identical
      // math for why this doesn't double-count against delivery_fee.
      const commissionAmount = payload.commission_amount ?? 0;
      // Cost/stock/finance porting, PR3: same "already-frozen, sum as-is"
      // rule as use-create-order.ts — payload.commission_amount already
      // reflects a base that includes price_adjustment, so it's added here
      // exactly once, alongside (not instead of) commissionAmount.
      const priceAdjustment = payload.price_adjustment ?? 0;
      const finalTotal =
        totalAmount +
        priceAdjustment -
        payload.discount_amount -
        commissionAmount +
        payload.delivery_fee;

      // 4️⃣ Actualizar order
      const { data: updatedOrder, error: orderError } = await supabase
        .from("orders")
        .update({
          customer_id: payload.customer_id,
          customer_name: payload.customer_name,
          customer_address_id: payload.customer_address_id,
          delivery_type: payload.delivery_type,
          delivery_fee: payload.delivery_fee,
          payment_method: payload.payment_method,
          delivery_time: payload.delivery_time ?? null,
          discount_type: payload.discount_type,
          discount_value: payload.discount_value,
          discount_amount: payload.discount_amount,
          total_amount: finalTotal,
          notes: payload.notes,
          updated_at: new Date().toISOString(),
          source: payload.source ?? null,
          commission_rate: payload.commission_rate ?? 0,
          commission_amount: commissionAmount,
          price_adjustment: priceAdjustment,
          // Settings port, Phase 3: saving through the full edit always
          // means staff confirmed the fee (payload.delivery_fee is part of
          // the recomputed total above). This is also the only way to
          // resolve a pending order that useQuickPatchOrder's
          // commission/price_adjustment guard refuses to touch.
          delivery_fee_pending: false,
        })
        .eq("id", orderId)
        .select()
        .single();

      if (orderError) throw orderError;

      // 5️⃣ Insertar nuevos order_items
      const itemsToInsert = payload.items.map((item) => ({
        order_id: orderId,
        product_id: item.product_id,
        kind: item.kind,
        combo_id: item.combo_id ?? null,
        burger_name: item.burger_name,
        name_snapshot: item.name_snapshot ?? item.burger_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        customizations: item.customizations ?? null,
        // Phase 3: frozen price snapshot, see
        // scripts/020-order-items-variant-selections.sql. Edit mode
        // deletes+reinserts order_items (see step 2 above), so this must be
        // threaded through here too, not just in use-create-order.ts.
        variant_selections: item.variant_selections ?? null,
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert)
        .select();

      if (itemsError) throw itemsError;

      // 6️⃣ Insertar order_item_modifiers
      const extrasToInsert: any[] = [];

      payload.items.forEach((item, index) => {
        const orderItemId = insertedItems?.[index]?.id;
        if (!orderItemId) return;

        item.extras.forEach((extra) => {
          extrasToInsert.push({
            order_item_id: orderItemId,
            product_id: extra.product_id,
            name_snapshot: extra.name_snapshot,
            quantity: extra.quantity,
            unit_price: extra.unit_price,
            subtotal: extra.subtotal,
          });
        });
      });

      if (extrasToInsert.length > 0) {
        const { error: extrasError } = await supabase
          .from("order_item_modifiers")
          .insert(extrasToInsert);

        if (extrasError) throw extrasError;
      }

      // R2 guard, continued (see the reverse call near the top of this
      // function): reapply stock deduction against the NEW item lines,
      // built straight from `payload.items` — no need to read the
      // just-inserted rows back, OrderItemInput already carries every
      // field buildStockDeductionPlan needs (kind/product_id/quantity/
      // variant_selections/extras/customizations — the last one added in
      // PR5/Group 7b for combo-slot recipe resolution).
      if (wasCompleted) {
        const deductionItems: DeductionPlanItem[] = payload.items.map((item) => ({
          kind: item.kind,
          product_id: item.product_id,
          quantity: item.quantity,
          burger_name: item.burger_name,
          variant_selections: item.variant_selections,
          // Cost/stock/finance porting, PR5 (Group 7b): needed so a
          // re-applied combo line (edited item set on an already-completed
          // order) resolves its slot recipes too, not just product/addon
          // lines — OrderItemInput already carries this field unchanged.
          customizations: item.customizations ?? null,
          extras: item.extras.map((extra) => ({
            product_id: extra.product_id,
            quantity: extra.quantity,
          })),
        }));

        await applyStockDeduction(supabase, orderId, deductionItems);
      }

      return updatedOrder;
    },
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-history"] });
      queryClient.invalidateQueries({ queryKey: ["order-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["today-orders-count"] });
      invalidateOrderStockQueries(queryClient, orderId);
    },
    onError: (error) => {
      console.error("❌ Error actualizando pedido:", error);
    },
  });
}