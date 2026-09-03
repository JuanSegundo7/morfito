"use client";

import type React from "react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Eye,
  Edit,
  User,
  DollarSign,
  ArrowRight,
  Copy,
  Timer,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { Order } from "@/lib/types";
import { formatCurrency, getRelativeTime } from "@/lib/utils/format";
import { useTogglePaymentStatus, useQuickPatchOrder } from "@/lib/hooks/orders/use-orders";
import { cn } from "@/lib/utils";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { formatOrderForDelivery } from "@/lib/utils/formatOrderDelivery";
import { toast } from "sonner";
import { statusConfig, statusEdgeStyle } from "@/lib/utils/order-status-style";

interface OrderCardMobileProps {
  order: Order;
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  onChangeStatus?: (order: Order) => void;
}

export function OrderCardMobile({
  order,
  onViewDetails,
  onEditOrder,
  onChangeStatus,
}: OrderCardMobileProps) {
  const togglePayment = useTogglePaymentStatus();
  const quickPatch = useQuickPatchOrder();
  const status = order.status;
  const config = statusConfig[status];

  const canEdit = order.status === "new" || order.status === "ready";

  const [isEditing, setIsEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [draftMethod, setDraftMethod] = useState<"cash" | "transfer">(order.payment_method);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftAmount(String(order.total_amount));
    setDraftMethod(order.payment_method);
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parsed = parseInt(draftAmount, 10);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Monto inválido");
      return;
    }
    quickPatch.mutate(
      { orderId: order.id, total_amount: parsed, payment_method: draftMethod },
      {
        onSuccess: () => {
          toast.success("Pedido actualizado");
          setIsEditing(false);
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Error al guardar"),
      },
    );
  };

  const handlePaymentToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePayment.mutate({ orderId: order.id, isPaid: !order.is_paid });
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatOrderForWhatsapp(order);
    await navigator.clipboard.writeText(text);
    toast.success("Pedido copiado para WhatsApp");
  };

  const handleCopyDelivery = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatOrderForDelivery(order);
    await navigator.clipboard.writeText(text);
    toast.success("Pedido copiado para delivery");
  };

  return (
    // ✅ Eliminado "lg:hidden" — lo maneja el wrapper en SortableOrderCard
    <Card interactive className="status-edge p-0" style={statusEdgeStyle[status]}>
      <CardContent className="p-4 space-y-3">
        {/* Delivery time banner — en lockstep con order-card.tsx (antes
            faltaba acá: gap funcional, no solo visual) */}
        {order.delivery_time && (
          <div className="flex items-center gap-2 rounded-md material-thin border-[var(--accent-tint-32)] px-3 py-1.5">
            <Timer className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
            <span className="text-callout font-semibold text-[var(--accent-brand)]">
              {order.delivery_type === "delivery" ? "Entrega:" : "Retira:"}{" "}
              {order.delivery_time}
            </span>
          </div>
        )}

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <p className="text-headline vibrant numeric">
            #{order.order_number}
          </p>

          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer rounded-full"
              onClick={handleCopy}
              title="Copiar para WhatsApp"
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer rounded-full"
              onClick={handleCopyDelivery}
              title="Copiar para delivery"
            >
              🛵
            </Button>

            <button
              onClick={handlePaymentToggle}
              className={cn(
                "rounded-full p-2 transition-colors cursor-pointer",
                order.is_paid
                  ? "bg-[var(--status-paid-tint)] text-[var(--status-paid)] hover:brightness-110"
                  : "bg-[var(--accent-tint-16)] text-[var(--accent-brand)] hover:bg-[var(--accent-tint-32)]",
              )}
              title={
                order.is_paid
                  ? "Pagado - Click para marcar como no pagado"
                  : "No pagado - Click para marcar como pagado"
              }
            >
              <DollarSign className="h-4 w-4" />
            </button>
            <Badge className={config.className}>{config.label}</Badge>
          </div>
        </div>

        {/* META + TOTAL */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-callout vibrant">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {order.customer_name}
            </div>
            <div className="flex items-center gap-1 text-footnote text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="numeric">{getRelativeTime(order.created_at)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {!isEditing ? (
              <div className="flex items-center gap-1.5">
                <span className="text-amount numeric vibrant">
                  {formatCurrency(order.total_amount)}
                </span>
                {canEdit && (
                  <button
                    onClick={handleStartEdit}
                    title="Editar precio y método de pago"
                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <Input
                  type="number"
                  min="0"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                  className="w-24 h-8 px-2 text-right text-base font-bold"
                />
                <div className="flex gap-1">
                  {(["cash", "transfer"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraftMethod(m);
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer",
                        draftMethod === m
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:bg-accent",
                      )}
                    >
                      {m === "cash" ? "💵 Efectivo" : "🏦 Transfer"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTONES */}
        {!isEditing ? (
          <div className="flex gap-2 border-t pt-3">
            {canEdit && onEditOrder && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 bg-card"
                onClick={() => onEditOrder(order)}
              >
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}

            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={() => onViewDetails(order)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Ver detalles
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 border-t pt-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveEdit}
              disabled={quickPatch.isPending}
              className="text-[var(--status-paid)] hover:bg-[var(--status-paid-tint)]"
            >
              <Check className="mr-1 h-4 w-4" />
              Guardar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelEdit}
              className="text-destructive hover:bg-destructive/10"
            >
              <X className="mr-1 h-4 w-4" />
              Cancelar
            </Button>
          </div>
        )}

        {/* Cambiar estado */}
        {!isEditing &&
          onChangeStatus &&
          (order.status === "new" || order.status === "ready") && (
            <div className="flex items-center justify-between">
              <div>
                {order.payment_method === "cash" && (
                  <Badge variant="outline" className="text-xs gap-1 bg-card">
                    💵 Efectivo
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="bg-card"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeStatus(order);
                }}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                {order.status === "new" ? "Listo" : "Completar"}
              </Button>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
