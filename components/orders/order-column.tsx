"use client";

import { useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { cardPresence, springs } from "@/lib/motion";
import { SortableOrderCard } from "./sorteable-order-card";

// Punto de estado y glow de drop-target derivados del token, ya no de un
// string de color crudo pasado por el dashboard.
const statusDotClass: Record<string, string> = {
  new: "bg-[var(--status-new)]",
  ready: "bg-[var(--status-ready)]",
  completed: "bg-[var(--status-completed)]",
  canceled: "bg-[var(--status-canceled)]",
};

const statusRingClass: Record<string, string> = {
  new: "ring-[var(--status-new)]",
  ready: "ring-[var(--status-ready)]",
  completed: "ring-[var(--status-completed)]",
  canceled: "ring-[var(--status-canceled)]",
};

interface OrderColumnProps {
  title: string;
  status: OrderStatus;
  orders: Order[];
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void; // 🆕
  onChangeStatus?: (order: Order) => void;
}

export function OrderColumn({
  title,
  status,
  orders,
  onViewDetails,
  onEditOrder, // 🆕
  onChangeStatus,
}: OrderColumnProps) {
  const filteredOrders = orders.filter((order) => order.status === status);
  const columnRevenue = filteredOrders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  // Causalidad y armonía (§13): al soltar una tarjeta acá, el hairline
  // de la columna flashea su color de estado por ~260ms. Se detecta un
  // "drop" como un incremento de conteo, no un evento propio — la
  // columna no ve onDragEnd, solo el resultado de la mutación.
  const prevCountRef = useRef(filteredOrders.length);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (filteredOrders.length > prevCountRef.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 260);
      prevCountRef.current = filteredOrders.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = filteredOrders.length;
  }, [filteredOrders.length]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-h-0 rounded-2xl material-well transition-colors duration-[260ms]",
        (isOver || flashing) && cn("ring-2", statusRingClass[status] ?? "ring-primary/40"),
      )}
    >
      <div className="shrink-0 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={cn("h-2 w-2 rounded-full", statusDotClass[status])} />
          <h2 className="text-overline text-muted-foreground">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {columnRevenue > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatCurrency(columnRevenue)}
            </span>
          )}
          <span className="relative inline-flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={filteredOrders.length}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 8, opacity: 0 }}
                transition={springs.press}
                className="inline-block"
              >
                {filteredOrders.length}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>
      <div
        className="
      flex-1 min-h-0 overflow-y-auto p-4 space-y-6 scroll-edge-y
      max-h-[calc(100vh-240px)]
      lg:max-h-[calc(100vh-300px)]
    "
      >
        <SortableContext
          items={filteredOrders.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          {filteredOrders.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">Sin pedidos</p>
            </div>
          ) : (
            // popLayout: la tarjeta que sale se saca del flujo antes de
            // terminar su exit, así las que quedan cierran el hueco con
            // el spring `move` en vez de esperar a que termine de encogerse.
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredOrders.map((order) => (
                <motion.div
                  key={order.id}
                  layout
                  variants={cardPresence}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={springs.move}
                >
                  <SortableOrderCard
                    order={order}
                    onViewDetails={onViewDetails}
                    onEditOrder={onEditOrder} // 🆕
                    onChangeStatus={onChangeStatus} // 👈
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* hint iOS-style — solo en la columna "new", no duplicado en ambas */}
          {status === "new" && filteredOrders.length > 0 && (
            <div className="pointer-events-none mt-4 flex justify-center">
              <div className=" px-3 py-1 text-xs text-muted-foreground">
                - Arrastrá las tarjetas para cambiar su estado -
              </div>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
