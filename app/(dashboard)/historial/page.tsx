"use client";

import { useState, useMemo, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Printer,
  RotateCcw,
  Trash,
} from "lucide-react";
import { useOrdersHistory } from "@/lib/hooks/orders/use-orders-history";
import type { Order } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { usePrintOrder } from "@/lib/hooks/use-print-order";
import { orderStatusConfig } from "@/lib/utils/order-status";
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
import {
  useCancelOrder,
  useReactivateOrder,
} from "@/lib/hooks/orders/use-orders";

// 👉 calendario
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { toast } from "sonner";

type DateFilter = "today" | "week" | "custom";

export default function OrdersHistoryPage() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToReactivate, setOrderToReactivate] = useState<Order | null>(null);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [page, setPage] = useState(0);

  const pageSize = 10;

  const printOrder = usePrintOrder();
  const cancelOrder = useCancelOrder();
  const reactivateOrder = useReactivateOrder();

  const dateRange = useMemo(() => {
    const now = new Date();

    if (dateFilter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (dateFilter === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    const start = new Date(customDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customDate);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }, [dateFilter, customDate]);

  useEffect(() => {
    setPage(0);
  }, [dateRange.from, dateRange.to]);

  const { data: orders, isLoading } = useOrdersHistory(dateRange);

  const totalRevenue = useMemo(() => {
    return (
      orders
        ?.filter((o) => o.status === "completed")
        .reduce((acc, o) => acc + Number(o.total_amount), 0) || 0
    );
  }, [orders]);

  const paginatedOrders = useMemo(() => {
    if (!orders) return [];
    return orders.slice(page * pageSize, (page + 1) * pageSize);
  }, [orders, page]);

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  const handleCancelOrder = (order: Order) => {
    setOrderToCancel(order);
    setCancelDialogOpen(true);
  };

  const confirmCancelOrder = () => {
    if (!orderToCancel) return;
    cancelOrder.mutate({ orderId: orderToCancel.id });
    setCancelDialogOpen(false);
    setOrderToCancel(null);
  };

  // Rara, y dispara una re-deduccion de stock invisible para quien la
  // clickea -- a diferencia de cancelar (que ya confirma) esto no
  // confirmaba nada. El dialogo existe para explicar esa consecuencia,
  // no solo para frenar el click (§16.2).
  const handleReactivateOrder = (order: Order) => {
    setOrderToReactivate(order);
    setReactivateDialogOpen(true);
  };

  const confirmReactivateOrder = () => {
    if (!orderToReactivate) return;
    reactivateOrder.mutate({
      orderId: orderToReactivate.id,
      nextStatus: orderToReactivate.is_paid ? "completed" : "new",
    });
    setReactivateDialogOpen(false);
    setOrderToReactivate(null);
  };

  return (
    <section className="flex flex-1 min-h-0 flex-col">
      <Header
        title="Historial de Pedidos"
        subtitle="Revisa todos los pedidos"
      />

      <div className="flex-1 overflow-auto p-6 md:px-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Select
              value={dateFilter}
              onValueChange={(v) => setDateFilter(v as DateFilter)}
            >
              <SelectTrigger className="h-10 w-55 bg-white">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Fecha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Última semana</SelectItem>
                <SelectItem value="custom">Fecha específica</SelectItem>
              </SelectContent>
            </Select>

            {dateFilter === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-55 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(customDate, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={(date) => date && setCustomDate(date)}
                    initialFocus
                    className="p-4"
                    classNames={{
                      month: "space-y-4",
                      caption: "flex justify-center pt-1 relative items-center",
                      table: "border-collapse",
                      head_row: "flex gap-2",
                      head_cell:
                        "w-9 text-muted-foreground font-normal text-subheadline",
                      row: "flex gap-2 mt-2",
                      cell: "w-9 h-9 text-center p-0 relative",
                      day: "h-9 w-9 rounded-md hover:bg-accent",
                      day_selected:
                        "bg-primary text-primary-foreground hover:bg-primary",
                      day_today: "border border-primary",
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <Card className="min-w-50 bg-card">
            <CardContent className="flex items-center justify-between gap-2 p-4">
              <span className="text-subheadline text-muted-foreground">
                {dateFilter === "today"
                  ? "Ingresos del día"
                  : dateFilter === "week"
                    ? "Ingresos de la semana"
                    : `Ingresos del ${format(customDate, "PPP", { locale: es })}`}
              </span>
              <span className="text-title3 font-bold text-primary">
                {formatCurrency(totalRevenue)}
              </span>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Pedidos ({orders?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : orders && orders.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-overline">Pedido</TableHead>
                        <TableHead className="text-overline">Cliente</TableHead>
                        <TableHead className="text-overline">Estado</TableHead>
                        <TableHead className="text-overline">Total</TableHead>
                        <TableHead className="text-overline">Fecha/Hora</TableHead>
                        <TableHead className="text-overline text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedOrders.map((order) => {
                        const config = orderStatusConfig[order.status];
                        return (
                          <TableRow key={order.id} className="hover:bg-white/[0.035]">
                            <TableCell className="font-mono font-medium">
                              #{order.order_number}
                            </TableCell>
                            <TableCell>{order.customer_name}</TableCell>
                            <TableCell>
                              <Badge className={config.className}>
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium numeric">
                              {formatCurrency(order.total_amount)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateTime(order.created_at)}
                            </TableCell>
                            <TableCell className="flex items-center justify-end gap-2">
                              <span className={`text-overline uppercase ${order.payment_method === "cash" ? "text-emerald-600" : "text-blue-600"}`}>
                                {order.payment_method === "cash" ? "Efectivo" : "Transferencia"}
                              </span>
                              <span className="text-border select-none">|</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(order)}
                                className="cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => printOrder.mutate(order.id)}
                                className="cursor-pointer"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const text = formatOrderForWhatsapp(order);
                                  await navigator.clipboard.writeText(text);
                                  toast.success("Pedido copiado para WhatsApp");
                                }}
                                className="cursor-pointer"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {order.status === "canceled" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReactivateOrder(order)}
                                  className="cursor-pointer"
                                >
                                  <RotateCcw className="h-4 w-4 text-emerald-600" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelOrder(order)}
                                  className="cursor-pointer"
                                >
                                  <Trash className="h-4 w-4 text-red-600" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* 👉 Controles de paginación */}
                {orders.length > pageSize && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <span className="text-subheadline text-muted-foreground">
                      Mostrando {page * pageSize + 1}–
                      {Math.min((page + 1) * pageSize, orders.length)} de{" "}
                      {orders.length} pedidos
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p - 1)}
                        disabled={page === 0}
                        className="bg-card"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <span className="text-subheadline font-medium">
                        Página {page + 1} de{" "}
                        {Math.ceil(orders.length / pageSize)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={(page + 1) * pageSize >= orders.length}
                        className="bg-card"
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                No hay pedidos para el período seleccionado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderDetailsModal
        order={selectedOrder}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido</AlertDialogTitle>
            <AlertDialogDescription>
              El pedido #{orderToCancel?.order_number} será marcado como
              <strong> cancelado</strong>. Esta acción puede revertirse más
              adelante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelOrder}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancelar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Reactivar el pedido #{orderToReactivate?.order_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vuelve al estado "{orderToReactivate?.is_paid ? "Completado" : "Nuevo"}".
              Se volverá a descontar el stock de los insumos usados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReactivateOrder}>
              Reactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
