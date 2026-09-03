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
  User,
  DollarSign,
  Edit,
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

interface OrderCardProps {
  order: Order;
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  isDragging?: boolean;
  visualStatus?: Order["status"];
  onChangeStatus?: (order: Order) => void;
}

export function OrderCard({
  order,
  onViewDetails,
  onEditOrder,
  isDragging,
  onChangeStatus,
  visualStatus = order.status,
}: OrderCardProps) {
  const canEdit = order.status === "new" || order.status === "ready";
  const togglePayment = useTogglePaymentStatus();
  const quickPatch = useQuickPatchOrder();
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

  const status = visualStatus ?? order.status;
  const config = statusConfig[status as keyof typeof statusConfig];

  return (
    <Card
      interactive
      className={cn(
        "status-edge cursor-grab p-0",
        isDragging && "opacity-40 saturate-50 shadow-none",
      )}
      style={statusEdgeStyle[status]}
    >
      <CardContent className="p-4 space-y-3">
        {/* Delivery time banner — shown at the very top when available */}
        {order.delivery_time && (
          <div className="flex items-center gap-2 rounded-md material-thin border-[var(--accent-tint-32)] px-3 py-1.5">
            <Timer className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
            <span className="text-callout font-semibold text-[var(--accent-brand)]">
              {order.delivery_type === "delivery" ? "Entrega:" : "Retira:"}{" "}
              {order.delivery_time}
            </span>
          </div>
        )}

        {/* Header: order number + time ago + status badge + payment */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-headline vibrant numeric">
              #{order.order_number}
            </p>
            <div className="flex items-center gap-1.5 text-footnote text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="numeric">{getRelativeTime(order.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer rounded-full"
              onClick={handleCopy}
              title="Copiar para WhatsApp"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer rounded-full"
              onClick={handleCopyDelivery}
              title="Copiar para delivery"
            >
              🛵
            </Button>
            <Badge className={config.className}>{config.label}</Badge>
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
          </div>
        </div>

        {/* Customer name */}
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-callout vibrant">{order.customer_name}</span>
        </div>

        {/* Footer: total + actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          {!isEditing ? (
            <div className="flex items-center gap-2">
              <p className="text-amount numeric vibrant">
                {formatCurrency(order.total_amount)}
              </p>
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  title="Editar precio y método de pago"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                type="number"
                min="0"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                autoFocus
                className="w-28 h-8 px-2 text-lg font-bold"
              />
              <div className="flex gap-1.5">
                {(["cash", "transfer"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftMethod(m);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                      draftMethod === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:bg-accent",
                    )}
                  >
                    {m === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isEditing ? (
            <div className="flex items-center gap-2">
              {canEdit && onEditOrder && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditOrder(order);
                  }}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  Editar
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="cursor-pointer"
                onClick={() => onViewDetails(order)}
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Ver detalles
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 self-start">
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
        </div>

        {/* Status advance button */}
        {!isEditing && (
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              {order.payment_method === "cash" && (
                <Badge variant="outline" className="text-xs gap-1 bg-card">
                  💵 Efectivo
                </Badge>
              )}
            </div>
            {onChangeStatus &&
              (order.status === "new" || order.status === "ready") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer bg-card"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeStatus(order);
                  }}
                >
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                  {order.status === "new" ? "Listo" : "Completar"}
                </Button>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
