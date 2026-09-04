"use client";

import type React from "react";
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

// Punto de estado, derivado del token, ya no de un string de color crudo
// pasado por el dashboard.
const statusDotClass: Record<string, string> = {
  new: "bg-[var(--status-new)]",
  ready: "bg-[var(--status-ready)]",
  completed: "bg-[var(--status-completed)]",
  canceled: "bg-[var(--status-canceled)]",
};

// El color real (no la clase) para --status-color de drop-glow — "transparent"
// lo apaga sin tener que sacar la clase entera (así el transition del
// utility no se pierde al togglear, evitando el bug del ring que aparecía
// de golpe en vez de desvanecerse).
const statusColorVar: Record<string, string> = {
  new: "var(--status-new)",
  ready: "var(--status-ready)",
  completed: "var(--status-completed)",
  canceled: "var(--status-canceled)",
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

  // Causalidad y armonía (§13): al soltar una tarjeta acá, drop-glow
  // flashea el color de estado de la columna. Se detecta un "drop" como
  // un incremento de conteo, no un evento propio — la columna no ve
  // onDragEnd, solo el resultado de la mutación.
  const prevCountRef = useRef(filteredOrders.length);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (filteredOrders.length > prevCountRef.current) {
      setFlashing(true);
      // 420ms, no 260ms: si el timer y la transición del glow duraran lo
      // mismo, el fade-out empezaría apenas terminara el fade-in y nunca
      // se vería el brillo completo.
      const t = setTimeout(() => setFlashing(false), 420);
      prevCountRef.current = filteredOrders.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = filteredOrders.length;
  }, [filteredOrders.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // scroll-edge-y (globals.css) lee --edge-top: en reposo es 0px (sin
  // efecto), y sube a 14px apenas hay algo scrolleado arriba — así el
  // fade solo aparece cuando de verdad hay contenido oculto arriba.
  const handleScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      el.style.setProperty("--edge-top", `${Math.min(14, el.scrollTop)}px`);
    });
  };

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col min-h-0 rounded-2xl material-well drop-glow"
      style={
        {
          "--status-color": isOver || flashing ? statusColorVar[status] : "transparent",
        } as React.CSSProperties
      }
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
            <span className="text-caption text-muted-foreground font-mono">
              {formatCurrency(columnRevenue)}
            </span>
          )}
          <span className="relative inline-flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-full bg-muted px-2.5 py-0.5 text-caption font-semibold">
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
        ref={scrollRef}
        onScroll={handleScroll}
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
              <p className="text-subheadline text-muted-foreground">Sin pedidos</p>
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
              <div className=" px-3 py-1 text-caption text-muted-foreground">
                - Arrastrá las tarjetas para cambiar su estado -
              </div>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
