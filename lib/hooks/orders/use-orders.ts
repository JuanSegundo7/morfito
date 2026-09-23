"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus, OrderWithItems } from "@/lib/types";
import {
  syncOrderStockForTransition,
  invalidateOrderStockQueries,
} from "@/lib/hooks/supplies/use-order-stock-sync";

/**
 * Cost/stock/finance porting, PR4 (Group 7a): fetches an order's CURRENT
 * status right before a status-writing mutation updates it, so
 * syncOrderStockForTransition below always gets a fresh (from, to) pair to
 * decide apply/reverse/no-op from — never trusting a possibly-stale value
 * the caller might have (e.g. react-query cache). Shared by all four
 * status-writing mutations in this file (useUpdateOrderStatus,
 * useCancelOrder, useReactivateOrder, useCompleteOrder).
 */
async function fetchCurrentOrderStatus(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
): Promise<OrderStatus> {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data.status as OrderStatus;
}

export function useOrders() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:customers (
            id,
            name,
            phone,
            customer_addresses (
              id,
              label,
              address,
              notes,
              is_default
            )
          ),
          order_items (
            id,
            burger_name,
            quantity,
            unit_price,
            subtotal,
            customizations,
            product_id,
            kind,
            order_item_modifiers (
              id,
              name_snapshot,
              quantity,
              unit_price,
              subtotal
            )
          )
        `,
        )
        .in("status", ["new", "ready"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 10000,
  });
}

export function useOrderWithItems(orderId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["order", orderId],
    enabled: !!orderId,

    queryFn: async () => {
      if (!orderId) return null;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer: customers (
            phone
          ),
          customer_address: customer_addresses (
            id,
            label,
            address,
            is_default
          )
        `,
        )
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) throw itemsError;

      if (!items || items.length === 0) {
        return { ...order, items: [] } as OrderWithItems;
      }

      const itemsWithExtras = await Promise.all(
        items.map(async (item) => {
          const { data: extras, error: extrasError } = await supabase
            .from("order_item_modifiers")
            .select("*")
            .eq("order_item_id", item.id);

          if (extrasError) throw extrasError;

          return {
            ...item,
            extras: extras ?? [],
          };
        }),
      );

      return {
        ...order,
        items: itemsWithExtras,
      } as OrderWithItems;
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: string;
      status: OrderStatus;
    }) => {
      // Cost/stock/finance porting, PR4 (Group 7a): this is a generic
      // status-setter also capable of writing "completed" (see
      // components/orders/orders-dashboard.tsx's drag-and-drop + "Marcar
      // completado" flows — both route through this hook, not the
      // dedicated useCompleteOrder below) — must sync stock whenever the
      // transition enters OR leaves "completed".
      const previousStatus = await fetchCurrentOrderStatus(supabase, orderId);

      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;

      await syncOrderStockForTransition({
        supabase,
        orderId,
        from: previousStatus,
        to: status,
      });

      return { orderId, status };
    },

    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) => {
        if (!old) return old;
        return old
          .map((order) =>
            order.id === orderId
              ? { ...order, status, updated_at: new Date().toISOString() }
              : order,
          )
          .filter(
            (order) => order.status === "new" || order.status === "ready",
          );
      });

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: (data) => {
      queryClient.refetchQueries({
        queryKey: ["orders"],
        type: "active",
      });

      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      invalidateOrderStockQueries(queryClient, data.orderId);
    },
  });
}

export function useTogglePaymentStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      isPaid,
    }: {
      orderId: string;
      isPaid: boolean;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ is_paid: isPaid, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
    },
    onMutate: async ({ orderId, isPaid }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) => {
        if (!old) return old;
        return old.map((order) =>
          order.id === orderId ? { ...order, is_paid: isPaid } : order,
        );
      });

      return { previousOrders };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      // Cost/stock/finance porting, PR4 (Group 7a): reverses stock when the
      // order being canceled was previously "completed" — a no-op via
      // syncOrderStockForTransition for every other previous status.
      const previousStatus = await fetchCurrentOrderStatus(supabase, orderId);

      const { error } = await supabase
        .from("orders")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;

      await syncOrderStockForTransition({
        supabase,
        orderId,
        from: previousStatus,
        to: "canceled",
      });
    },

    onMutate: async ({ orderId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders"] }),
        queryClient.cancelQueries({ queryKey: ["orders-history"] }),
      ]);

      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old
          ?.map((order) =>
            order.id === orderId
              ? { ...order, status: "canceled" as OrderStatus }
              : order,
          )
          .filter(
            (order) => order.status === "new" || order.status === "ready",
          ),
      );

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      invalidateOrderStockQueries(queryClient, orderId);
    },
  });
}

export function useReactivateOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      nextStatus,
    }: {
      orderId: string;
      nextStatus: "new" | "completed";
    }) => {
      // Cost/stock/finance porting, PR4 (Group 7a): can transition an order
      // back to "completed" from a terminal state (see app/(dashboard)/
      // historial/page.tsx's handleReactivateOrder) — sync applies whenever
      // the new status is "completed"; syncOrderStockForTransition itself
      // no-ops if, for some reason, the order was somehow already
      // "completed" (previousStatus === nextStatus).
      const previousStatus = await fetchCurrentOrderStatus(supabase, orderId);

      const { error } = await supabase
        .from("orders")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;

      await syncOrderStockForTransition({
        supabase,
        orderId,
        from: previousStatus,
        to: nextStatus,
      });
    },

    onMutate: async ({ orderId, nextStatus }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders"] }),
        queryClient.cancelQueries({ queryKey: ["orders-history"] }),
      ]);

      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old?.map((order) =>
          order.id === orderId ? { ...order, status: nextStatus } : order,
        ),
      );

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      invalidateOrderStockQueries(queryClient, orderId);
    },
  });
}

export function useCompleteOrder() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Cost/stock/finance porting, PR4 (Group 7a): currently unreachable
      // from any UI call site (components/orders/orders-dashboard.tsx
      // routes every "mark completed" flow through useUpdateOrderStatus
      // instead — verified by grep, not assumed), but wired for
      // correctness per this PR's task list, matching this repo's "must
      // not silently corrupt the ledger if that ever becomes reachable"
      // convention (see use-update-order.ts's R2 guard for the same
      // reasoning applied elsewhere).
      const previousStatus = await fetchCurrentOrderStatus(supabase, orderId);

      const { error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          pending_print: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;

      await syncOrderStockForTransition({
        supabase,
        orderId,
        from: previousStatus,
        to: "completed",
      });

      return { orderId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      invalidateOrderStockQueries(queryClient, data.orderId);
    },
  });
}

export function useQuickPatchOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      total_amount,
      payment_method,
      delivery_fee,
    }: {
      orderId: string;
      total_amount: number;
      payment_method: "cash" | "transfer";
      // Settings port, Phase 3: present only when staff are resolving a
      // "Envío a confirmar" order (delivery_fee_pending) from the kanban
      // card. Ported from jebbs-dashboard's useQuickPatchOrder.
      //
      // Interaction with the commission/price_adjustment guard below: the
      // guard runs FIRST and always wins. An order with a nonzero
      // commission_amount/price_adjustment AND delivery_fee_pending = true
      // therefore CANNOT be resolved from quick-edit at all — the guard
      // throws before delivery_fee is ever written. The escape hatch is the
      // full edit path (use-update-order.ts), which recomputes the total
      // from the full item/discount/commission breakdown and clears
      // delivery_fee_pending itself. That is why that file's change matters
      // more here than it does in jebbs (which has no such guard).
      delivery_fee?: number;
    }) => {
      // Cost/stock/finance porting, PR4 task 7a.9 (R4 guard): this mutation
      // writes total_amount as a raw manual override — it has no access to
      // itemsTotal/discountAmount (order-card.tsx/order-card-mobile.tsx,
      // its only two call sites, only ever pass a hand-typed number), so
      // there is no formula to correctly "recompute" here the way
      // use-create-order.ts/use-update-order.ts do from their own item
      // lines. commission_amount/price_adjustment (PR2/PR3) are frozen
      // amounts derived from a DIFFERENT base (the pre-override total) —
      // silently letting this mutation overwrite total_amount out from
      // under them would leave those two fields arithmetically
      // inconsistent with the new total with no way for this hook to fix
      // them correctly. Smaller, more surgical fix (per this PR's task
      // instructions) than trying to reconstruct/re-derive a formula this
      // call site was never given the inputs for: block quick-patch
      // entirely on any order that already carries a nonzero commission or
      // price adjustment, with a clear, specific error message. Full edits
      // to such an order go through the order wizard's edit flow
      // (use-update-order.ts), which DOES have the full item/discount
      // breakdown needed to recompute correctly.
      const { data: existing, error: fetchError } = await supabase
        .from("orders")
        .select("commission_amount, price_adjustment")
        .eq("id", orderId)
        .single();

      if (fetchError) throw fetchError;

      if ((existing?.commission_amount ?? 0) !== 0 || (existing?.price_adjustment ?? 0) !== 0) {
        throw new Error(
          "No se puede editar el monto rápidamente en un pedido con comisión o ajuste de precio — editalo desde el pedido completo.",
        );
      }

      const { error } = await supabase
        .from("orders")
        .update({
          total_amount,
          payment_method,
          updated_at: new Date().toISOString(),
          // Receiving a delivery_fee means staff resolved the fee of a
          // "Envío a confirmar" order — it never stays pending after this.
          ...(delivery_fee !== undefined
            ? { delivery_fee, delivery_fee_pending: false }
            : {}),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onMutate: async ({ orderId, total_amount, payment_method, delivery_fee }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);
      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old?.map((o) =>
          o.id === orderId
            ? {
                ...o,
                total_amount,
                payment_method,
                ...(delivery_fee !== undefined
                  ? { delivery_fee, delivery_fee_pending: false }
                  : {}),
              }
            : o,
        ),
      );
      return { previousOrders };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousOrders)
        queryClient.setQueryData(["orders"], context.previousOrders);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["orders"], type: "active" });
    },
  });
}

export function useTodayOrdersCount() {
  const supabase = createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return useQuery({
    queryKey: ["orders-count-today"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });
}