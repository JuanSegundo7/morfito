import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { renderTemplate } from "@/lib/utils/renderTemplate";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";
import type { AppSettings } from "@/lib/types";

// Fallback used only when settings.pickup_address is null — byte-for-byte
// the placeholder this file already hardcoded as PICKUP_ADDRESS before this
// port, so an unconfigured shop's delivery message is unchanged on day one.
const PICKUP_ADDRESS_PLACEHOLDER = "Dirección de retiro pendiente de configurar";

// Tipo acotado a exactamente lo que este formatter lee de una orden — no el
// `Order` completo de lib/types/index.ts. Deliberadamente NO incluye
// `product_id`/`kind`/`order_item_modifiers` (los campos reales que
// order_items tiene hoy, ver lib/hooks/orders/use-orders.ts's select):
// `extra_id`/`order_item_extras` abajo son los nombres que el bloque de
// items de ESTE archivo sigue leyendo, sin haberse migrado nunca al modelo
// de producto genérico (scripts/010-generic-products.sql) — inconsistencia
// preexistente, documentada y explícitamente fuera de alcance para este
// port (ver lib/settings/sample-order.ts's comentario para el efecto
// práctico: la rama "SIDE" de abajo nunca dispara con datos reales).
export interface OrderForMessage {
  order_number: number | string;
  created_at: string;
  customer_name: string;
  customer?: {
    phone?: string | null;
    customer_addresses?: { id: string; address: string | null; notes?: string | null }[] | null;
  } | null;
  customer_address_id?: string | null;
  delivery_type: string;
  delivery_fee: number;
  payment_method: string;
  delivery_time?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount: number;
  commission_amount: number;
  price_adjustment: number;
  total_amount: number;
  notes?: string | null;
  order_items?: {
    quantity: number;
    burger_name: string;
    unit_price?: number;
    subtotal: number;
    customizations?: string | null;
    extra_id?: string | null;
    order_item_extras?: { extra_name: string; quantity: number; subtotal: number }[] | null;
  }[] | null;
}

export function buildOrderMessageVars(
  order: OrderForMessage,
  settings: AppSettings,
  businessName: string,
): Record<string, string> {
  const isDelivery = order.delivery_type === "delivery";

  const address = order.customer?.customer_addresses?.find(
    (a) => a.id === order.customer_address_id,
  );

  const orderItems = order.order_items ?? [];

  // ===== HEADER =====
  const paymentIcon = order.payment_method === "cash" ? "💵 Efectivo" : "🏦 Transferencia";
  const deliveryIcon = isDelivery ? "🚚" : "🏪";
  const deliveryLabel = isDelivery ? "Envío a domicilio" : "Retiro en local";

  // ===== ITEMS =====
  // Sin cambios respecto al formatOrderForWhatsapp.ts previo a este port —
  // ver el comentario de OrderForMessage arriba para por qué la rama
  // `item.extra_id` nunca dispara con order_items reales.
  const itemsBlock = orderItems.map((item) => {
    const extrasTotal =
      item.order_item_extras?.reduce((sum, extra) => sum + extra.subtotal, 0) ?? 0;
    const itemTotal = item.subtotal + extrasTotal;

    // SIDE
    if (item.extra_id) {
      const extrasLines = item.order_item_extras?.length
        ? "\n" + item.order_item_extras
            .map((e) => `   + ${e.quantity}x ${e.extra_name}${e.subtotal > 0 ? ` — ${formatCurrency(e.subtotal)}` : ""}`)
            .join("\n")
        : "";
      return `🍟 ${item.quantity}x ${item.burger_name} — ${formatCurrency(item.subtotal)}${extrasLines}${extrasTotal > 0 ? `\n   *Subtotal: ${formatCurrency(itemTotal)}*` : ""}`;
    }

    // BURGER o COMBO
    let customData: any = null;
    let isCombo = false;
    if (item.customizations) {
      try {
        customData = JSON.parse(item.customizations);
        isCombo = Array.isArray(customData);
      } catch {}
    }

    const detailParts: string[] = [];

    if (!isCombo && customData) {
      // Papas
      if (customData.friesQuantity !== undefined) {
        if (customData.friesQuantity === 0) {
          const discount = Math.abs(customData.friesAdjustment ?? 0);
          detailParts.push(discount > 0 ? `🍟 Sin papas (-${formatCurrency(discount)})` : `🍟 Sin papas`);
        } else if ((customData.friesAdjustment ?? 0) > 0) {
          detailParts.push(`🍟 ${customData.friesQuantity} papas (+${formatCurrency(customData.friesAdjustment)})`);
        } else {
          detailParts.push(`🍟 ${customData.friesQuantity} papas`);
        }
      }

      // Ingredientes removidos
      if (customData.removedIngredients?.length > 0) {
        detailParts.push(`❌ Sin: ${customData.removedIngredients.join(", ")}`);
      }

      // Extras (solo customData, no duplicar con order_item_extras)
      if (customData.extras?.length > 0) {
        customData.extras.forEach((extra: any) => {
          detailParts.push(`+ ${extra.quantity}x ${extra.name} — ${formatCurrency(extra.price * extra.quantity)}`);
        });
      }
    }

    // Combos
    const comboLines: string[] = [];
    if (isCombo && Array.isArray(customData)) {
      customData.forEach((slot: any) => {
        if (slot.burgers?.length > 0) {
          slot.burgers.forEach((burger: any) => {
            comboLines.push(`   🍔 ${burger.quantity}x ${burger.name} x${burger.meatCount}`);

            const burgerParts: string[] = [];
            if (burger.isVeggie) {
              burgerParts.push(`🌱 Veggie`);
            }
            if (burger.friesQuantity !== undefined) {
              if (burger.friesQuantity === 0) {
                const discount = Math.abs(burger.friesAdjustment ?? 0);
                burgerParts.push(discount > 0 ? `🍟 Sin papas (-${formatCurrency(discount)})` : `🍟 Sin papas`);
              } else if ((burger.friesAdjustment ?? 0) > 0) {
                burgerParts.push(`🍟 ${burger.friesQuantity} papas (+${formatCurrency(burger.friesAdjustment)})`);
              } else {
                burgerParts.push(`🍟 ${burger.friesQuantity} papas`);
              }
            }
            if (burger.removedIngredients?.length > 0) {
              burgerParts.push(`❌ Sin: ${burger.removedIngredients.join(", ")}`);
            }
            if (burger.extras?.length > 0) {
              burger.extras.forEach((extra: any) => {
                burgerParts.push(`+ ${extra.quantity}x ${extra.name} — ${formatCurrency(extra.price * extra.quantity)}`);
              });
            }
            if (burgerParts.length > 0) {
              comboLines.push(`      ${burgerParts.join(" · ")}`);
            }
          });
        }
        const extras = Array.isArray(slot.selectedExtras)
          ? slot.selectedExtras
          : slot.selectedExtra
            ? [slot.selectedExtra]
            : [];
        extras.forEach((se: any) => {
          const label = slot.slotType === "drink" ? "🥤" : slot.slotType === "side" ? "🍗" : "➕";
          comboLines.push(`   ${label} ${se.name}`);
        });
      });
    }

    if (!isCombo && customData?.isVeggie) {
      detailParts.unshift(`🌱 Veggie`);
    }

    const meatSuffix = !isCombo && customData?.meatCount ? ` x${customData.meatCount}` : "";
    const detailLine = detailParts.length > 0 ? `\n   ${detailParts.join(" · ")}` : "";
    const comboBlock = comboLines.length > 0 ? "\n" + comboLines.join("\n") : "";
    const subtotalLine = extrasTotal > 0 ? `\n   *Subtotal: ${formatCurrency(itemTotal)}*` : "";

    return `• ${item.quantity}x ${item.burger_name}${meatSuffix} — ${formatCurrency(item.subtotal)}${detailLine}${comboBlock}${subtotalLine}`;
  }).join("\n\n");

  // ===== TOTALES =====
  const totalParts: string[] = [];
  totalParts.push(`Subtotal ${formatCurrency(orderItems.reduce((sum, item) => {
    const extrasTotal = item.order_item_extras?.reduce((s, e) => s + e.subtotal, 0) ?? 0;
    return sum + item.subtotal + extrasTotal;
  }, 0))}`);
  if (order.delivery_fee > 0) totalParts.push(`Envío ${formatCurrency(order.delivery_fee)}`);
  const discountLabel = order.discount_type === "percentage" ? `Desc. ${order.discount_value}%` : "Desc.";
  if (order.discount_amount > 0) {
    totalParts.push(`${discountLabel} -${formatCurrency(order.discount_amount)}`);
  }
  if (order.commission_amount > 0) {
    totalParts.push(`Comisión -${formatCurrency(order.commission_amount)}`);
  }
  const adjustmentSign = order.price_adjustment > 0 ? "+" : "-";
  if (order.price_adjustment !== 0) {
    totalParts.push(`Ajuste ${adjustmentSign}${formatCurrency(Math.abs(order.price_adjustment))}`);
  }

  return {
    negocio: businessName,
    numero: String(order.order_number),
    fecha: formatDateTime(order.created_at),
    cliente: order.customer_name,
    telefono: order.customer?.phone ?? "-",
    metodo_pago: paymentIcon,
    icono_entrega: deliveryIcon,
    tipo_entrega: deliveryLabel,
    direccion: isDelivery ? (address?.address ?? "") : "",
    // Igual que el código original: las notas de dirección solo se mostraban
    // anidadas dentro del `if` de `address.address` — nunca solas.
    notas_direccion: isDelivery && address?.address ? (address?.notes ?? "") : "",
    etiqueta_hora: order.delivery_time ? (isDelivery ? "Entregar" : "Retirar") : "",
    hora_entrega: order.delivery_time ?? "",
    entrega: isDelivery ? (address?.address ?? "-") : "Retira en local",
    direccion_retiro: settings.pickup_address ?? PICKUP_ADDRESS_PLACEHOLDER,
    envio: formatCurrency(order.delivery_fee),
    total: formatCurrency(order.total_amount),
    notas: order.notes ?? "",
    linea_subtotal: totalParts[0],
    linea_envio: order.delivery_fee > 0 ? `Envío ${formatCurrency(order.delivery_fee)}` : "",
    linea_descuento: order.discount_amount > 0 ? `${discountLabel} -${formatCurrency(order.discount_amount)}` : "",
    linea_comision: order.commission_amount > 0 ? `Comisión -${formatCurrency(order.commission_amount)}` : "",
    linea_ajuste: order.price_adjustment !== 0 ? `Ajuste ${adjustmentSign}${formatCurrency(Math.abs(order.price_adjustment))}` : "",
    items: itemsBlock,
    totales: totalParts.join(" · "),
  };
}

export function formatOrderForWhatsapp(
  order: OrderForMessage,
  settings: AppSettings,
  businessName: string,
): string {
  const vars = buildOrderMessageVars(order, settings, businessName);
  const template = settings.whatsapp_template?.trim()
    ? settings.whatsapp_template
    : DEFAULT_APP_SETTINGS.whatsapp_template;
  return renderTemplate(template, vars);
}
