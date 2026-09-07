"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import { OrderColumn } from "./order-column";
import { OrderDetailsModal } from "./order-details-modal";
import { OrderWizardDrawer } from "../order-wizard/order-wizard-drawer";
import {
  useOrders,
  useTodayOrdersCount,
  useUpdateOrderStatus,
  useTogglePaymentStatus,
} from "@/lib/hooks/orders/use-orders";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "@/lib/types";
import { ClipboardList, Check, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { OrderCard } from "./order-card";
import { motion, useReducedMotion } from "framer-motion";
import { useSpring, easeOutIOS } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrderForEdit } from "@/lib/hooks/orders/use-order-for-edit";
import { toast } from "sonner";
import type { OrderStatus } from "@/lib/types";

// Glow del DragOverlay en el color de estado de la tarjeta que se está
// arrastrando (mismo mapeo que order-card.tsx / order-column.tsx).
const statusGlowVar: Record<string, string> = {
  new: "var(--status-new)",
  ready: "var(--status-ready)",
  completed: "var(--status-completed)",
  canceled: "var(--status-canceled)",
};

export function OrdersDashboard() {
  const { data: orders, isLoading, refetch, isRefetching } = useOrders();
  const { data: todayCount } = useTodayOrdersCount();
  const updateStatus = useUpdateOrderStatus();
  const togglePayment = useTogglePaymentStatus();

  const [orderIdToEdit, setOrderIdToEdit] = useState<string | null>(null);
  const { data: orderToEdit } = useOrderForEdit(orderIdToEdit);

  const [activeTab, setActiveTab] = useState<"new" | "ready">("new");

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  // Estado de la columna sobre la que se sostiene el drag ahora mismo — no
  // el estado original de la card. Alimenta visualStatus del DragOverlay
  // para que el borde de luz cambie de color ANTES de soltar (§13:
  // causalidad real, no decorativa).
  const [overStatus, setOverStatus] = useState<OrderStatus | null>(null);
  // Punto donde se agarró la card, en % relativos a su propio rect — ancla
  // el transform-origin del DragOverlay (§7: el lift tiene que originarse
  // donde tocó el dedo, no en el centro abstracto de la card).
  const [dragOrigin, setDragOrigin] = useState("50% 50%");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [orderToComplete, setOrderToComplete] = useState<Order | null>(null);

  // Explicito en vez de depender solo del efecto lateral de MotionConfig
  // reducedMotion="user" (que igual apaga scale/rotate gratis): bajo
  // reduced motion el lift no debe escalar ni rotar, pero necesita seguir
  // transmitiendo "esto se esta moviendo" -- un settle de opacidad, no nada.
  const reducedMotion = useReducedMotion();
  const liftTransition = useSpring("lift");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (orderToEdit && orderIdToEdit) {
      setWizardOpen(true);
    }
  }, [orderToEdit, orderIdToEdit]);

  // Sort orders by delivery_time ascending (earliest first, null/empty last)
  const sortedOrders = [...(orders ?? [])].sort((a, b) => {
    if (!a.delivery_time && !b.delivery_time) return 0;
    if (!a.delivery_time) return 1;
    if (!b.delivery_time) return -1;
    return a.delivery_time.localeCompare(b.delivery_time);
  });

  const handleDragStart = (event: DragStartEvent) => {
    const order = sortedOrders.find((o) => o.id === event.active.id);
    setActiveOrder(order || null);
    setOverStatus(null);

    // Origen del transform anclado a donde se agarró la card (§7) — no al
    // centro. rect es el bounding box inicial de la card; activatorEvent
    // es el pointer/mouse event nativo que arrancó el drag.
    const rect = event.active.rect.current.initial;
    const activatorEvent = event.activatorEvent;
    if (rect && "clientX" in activatorEvent) {
      const { clientX, clientY } = activatorEvent as PointerEvent;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      setDragOrigin(`${x}% ${y}%`);
    } else {
      setDragOrigin("50% 50%");
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverStatus(event.over ? (event.over.id as OrderStatus) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setOverStatus(null);

    if (!over) {
      setActiveOrder(null);
      return;
    }

    const orderId = active.id as string;
    const newStatus = over.id as OrderStatus;
    const previousStatus = activeOrder?.status;

    // Columnas y cards estan registradas como droppables en dnd-kit; si la
    // deteccion de colision alguna vez resuelve `over` a una card en vez de
    // a una columna, over.id seria un UUID, no un OrderStatus. Guard barato
    // para que ese "as" no escriba basura en orders.status.
    if (newStatus !== "new" && newStatus !== "ready") {
      setActiveOrder(null);
      return;
    }

    setActiveOrder(null);
    // Undo solo en el sentido "hacia atras" (listo->nuevo). nuevo->listo
    // es el flujo normal de alta frecuencia y se queda silencioso -- listo->
    // nuevo es rara y casi siempre un arrastre accidental, ahi si vale un
    // toast con Deshacer.
    updateStatus.mutate(
      { orderId, status: newStatus },
      {
        onSuccess: () => {
          if (previousStatus === "ready" && newStatus === "new") {
            toast("Pedido movido a Nuevos", {
              duration: 8000,
              action: {
                label: "Deshacer",
                onClick: () =>
                  updateStatus.mutate({ orderId, status: previousStatus }),
              },
            });
          }
        },
      },
    );
  };

  const handleCompleteOrder = (order: Order) => {
    if (!order.is_paid) {
      setOrderToComplete(order);
      setPaymentDialogOpen(true);
    } else {
      updateStatus.mutate({ orderId: order.id, status: "completed" });
    }
  };

  const handleConfirmComplete = () => {
    if (!orderToComplete) return;

    togglePayment.mutate(
      { orderId: orderToComplete.id, isPaid: true },
      {
        onSuccess: () => {
          updateStatus.mutate({
            orderId: orderToComplete.id,
            status: "completed",
          });
        },
      },
    );

    setPaymentDialogOpen(false);
    setOrderToComplete(null);
  };

  const handleEditOrder = (order: Order) => {
    setOrderIdToEdit(order.id);
  };

  const handleWizardClose = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setOrderIdToEdit(null);
    }
  };

  const handleChangeStatus = (order: Order) => {
    if (order.status === "new") {
      updateStatus.mutate({ orderId: order.id, status: "ready" });
    } else if (order.status === "ready") {
      handleCompleteOrder(order);
    }
  };

  const readyOrders = sortedOrders.filter((o) => o.status === "ready");
  const readyOrdersScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = readyOrdersScrollRef.current;
    if (!el) return;
    let target = el.scrollLeft;
    let rafId: number;
    const animate = () => {
      const diff = target - el.scrollLeft;
      if (Math.abs(diff) < 0.5) { el.scrollLeft = target; return; }
      el.scrollLeft += diff * 0.12;
      rafId = requestAnimationFrame(animate);
    };
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      target = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target + e.deltaY));
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(animate);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => { el.removeEventListener("wheel", handleWheel); cancelAnimationFrame(rafId); };
  }, [readyOrders]);

  return (
    <section className="flex flex-1 flex-col min-h-0">
      <Header
        title="Pedidos"
        subtitle="Interfaz de administración de pedidos"
        onCreateOrder={() => setWizardOpen(true)}
        onRefresh={() => refetch()}
        isRefreshing={isRefetching}
      />

      {/* MAIN */}
      <div className="flex-1 min-h-0 flex flex-col py-6">
        <div className="flex-1">
          {isLoading ? (
            <div className="grid h-full grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="p-4">
                  <Skeleton className="mb-4 h-8 w-32" />
                  <Skeleton className="h-40 w-full mb-3" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ))}
            </div>
          ) : sortedOrders && sortedOrders.length > 0 ? (
            <div className="flex-1 min-h-0 flex h-full">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="flex-1 min-h-0">
                  {/* Mobile: tabs */}
                  <div className="flex flex-col h-full md:hidden">
                    <div className="flex shrink-0 border-b border-border mb-4 gap-1">
                      <button
                        onClick={() => setActiveTab("new")}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-subheadline font-medium border-b-2 transition-colors active:scale-[0.97] active:duration-75",
                          activeTab === "new"
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full bg-[var(--status-new)]" />
                        Nuevos
                        <span className="rounded-full bg-muted px-2 py-0.5 text-caption">
                          {sortedOrders.filter((o) => o.status === "new").length}
                        </span>
                      </button>
                      <button
                        onClick={() => setActiveTab("ready")}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-subheadline font-medium border-b-2 transition-colors active:scale-[0.97] active:duration-75",
                          activeTab === "ready"
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full bg-[var(--status-ready)]" />
                        Listos
                        <span className="rounded-full bg-muted px-2 py-0.5 text-caption">
                          {sortedOrders.filter((o) => o.status === "ready").length}
                        </span>
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      {activeTab === "new" ? (
                        <OrderColumn
                          title="Nuevos"
                          status="new"
                          orders={sortedOrders}
                          onViewDetails={(o) => { setSelectedOrder(o); setDetailsOpen(true); }}
                          onEditOrder={handleEditOrder}
                          onChangeStatus={handleChangeStatus}
                        />
                      ) : (
                        <OrderColumn
                          title="Listos"
                          status="ready"
                          orders={sortedOrders}
                          onViewDetails={(o) => { setSelectedOrder(o); setDetailsOpen(true); }}
                          onEditOrder={handleEditOrder}
                          onChangeStatus={handleChangeStatus}
                        />
                      )}
                    </div>
                  </div>

                  {/* Desktop: side-by-side grid */}
                  <div className="hidden md:grid h-full min-h-0 md:grid-cols-2 gap-6">
                    <OrderColumn
                      title="Nuevos"
                      status="new"
                      orders={sortedOrders}
                      onViewDetails={(o) => {
                        setSelectedOrder(o);
                        setDetailsOpen(true);
                      }}
                      onEditOrder={handleEditOrder}
                      onChangeStatus={handleChangeStatus}
                    />
                    <OrderColumn
                      title="Listos"
                      status="ready"
                      orders={sortedOrders}
                      onViewDetails={(o) => {
                        setSelectedOrder(o);
                        setDetailsOpen(true);
                      }}
                      onEditOrder={handleEditOrder}
                      onChangeStatus={handleChangeStatus}
                    />
                  </div>
                </div>

                <DragOverlay
                  adjustScale={false}
                  dropAnimation={{
                    duration: reducedMotion ? 160 : 260,
                    easing: `cubic-bezier(${easeOutIOS.join(",")})`,
                  }}
                >
                  {activeOrder ? (
                    // will-change: transform va SOLO acá (§11) — es lo único
                    // que se mueve a cada frame del drag.
                    <motion.div
                      className="pointer-events-none rounded-2xl"
                      style={{
                        willChange: "transform",
                        transformOrigin: dragOrigin,
                        boxShadow: `var(--shadow-xl), 0 0 28px -6px ${
                          statusGlowVar[overStatus ?? activeOrder.status] ?? "var(--status-new)"
                        }`,
                      }}
                      initial={reducedMotion ? { opacity: 0.6 } : { scale: 1, rotate: 0 }}
                      animate={reducedMotion ? { opacity: 1 } : { scale: 1.03, rotate: -1 }}
                      transition={liftTransition}
                    >
                      <OrderCard
                        order={activeOrder}
                        visualStatus={overStatus ?? activeOrder.status}
                        onViewDetails={() => {}}
                      />
                    </motion.div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="rounded-full material-thin p-4">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-headline">
                Todo tranquilo por acá
              </h3>
              <p className="mt-1 text-footnote text-muted-foreground">
                Los nuevos pedidos aparecerán aquí
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="material-regular rounded-2xl p-4 min-h-17.5 shrink-0">
        <div className="flex h-full items-center justify-between gap-4">
          <div className="text-subheadline shrink-0">
            <span className="text-muted-foreground">
              Total pedidos del día:{" "}
            </span>
            <span className="font-semibold">{todayCount ?? 0}</span>
          </div>

          {readyOrders.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-subheadline text-muted-foreground shrink-0">
                Pedidos listos:
              </span>
              {readyOrders.length >= 4 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-caption">Usá la ruedita del mouse para ver más pedidos</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div ref={readyOrdersScrollRef} className="overflow-x-auto max-w-[620px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex gap-2">
                  {readyOrders.map((order) => (
                    <Button
                      key={order.id}
                      size="sm"
                      onClick={() => handleCompleteOrder(order)}
                      className="bg-[var(--status-ready)] text-white hover:brightness-110 shrink-0 whitespace-nowrap"
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Completar #{order.order_number}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <OrderDetailsModal
        order={selectedOrder}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEditOrder={handleEditOrder}
      />

      <OrderWizardDrawer
        open={wizardOpen}
        onOpenChange={handleWizardClose}
        mode={orderToEdit ? "edit" : "create"}
        orderToEdit={orderToEdit}
      />

      <AlertDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pedido no pagado</AlertDialogTitle>
            <AlertDialogDescription>
              El pedido #{orderToComplete?.order_number} aún no está marcado
              como pagado. ¿Desea marcarlo como pagado y completarlo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmComplete}>
              Marcar pagado y completar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}