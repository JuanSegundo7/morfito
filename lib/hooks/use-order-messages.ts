"use client";

import { toast } from "sonner";
import { useSettings, useBusinessName } from "@/lib/hooks/use-app-settings";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { formatOrderForDelivery } from "@/lib/utils/formatOrderDelivery";
import type { OrderForMessage } from "@/lib/utils/formatOrderWhatsapp";

export function useOrderMessages() {
  const settings = useSettings();
  const businessName = useBusinessName();

  const copyWhatsapp = async (order: OrderForMessage) => {
    try {
      const text = formatOrderForWhatsapp(order, settings, businessName);
      await navigator.clipboard.writeText(text);
      toast.success("Pedido copiado para WhatsApp");
    } catch (error) {
      console.error("Error al copiar el pedido:", error);
      toast.error("No se pudo copiar el pedido");
    }
  };

  const copyDelivery = async (order: OrderForMessage) => {
    try {
      const text = formatOrderForDelivery(order, settings, businessName);
      await navigator.clipboard.writeText(text);
      toast.success("Pedido copiado para delivery");
    } catch (error) {
      console.error("Error al copiar el pedido:", error);
      toast.error("No se pudo copiar el pedido");
    }
  };

  return { copyWhatsapp, copyDelivery };
}
