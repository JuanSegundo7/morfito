// Pure text preview of the thermal ticket, 42 columns wide (80mm paper).
// Mirrors the block renderers in morfito-print-service/src/printer/
// thermal-printer.ts: same block order, same enabled flags, same options.
// Text-size changes (double height/width) cannot be shown in plain text, so
// they are not represented; only content and layout are.

import type { OrderForMessage } from "@/lib/utils/formatOrderWhatsapp";
import { formatDateTime } from "@/lib/utils/format";
import {
  DEFAULT_FOOTER_TEXT,
  normalizeTicketLayout,
  type TicketBlock,
  type TicketLayout,
} from "./ticket-layout";

export const TICKET_COLUMNS = 42;

type Options = Record<string, boolean | string>;

const money = (n: number) => `$${n.toLocaleString("es-AR")}`;
const center = (s: string) =>
  s.length >= TICKET_COLUMNS ? s : " ".repeat(Math.floor((TICKET_COLUMNS - s.length) / 2)) + s;
const rule = () => "=".repeat(TICKET_COLUMNS);

function row(left: string, right: string): string {
  const gap = Math.max(1, TICKET_COLUMNS - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

function wrap(text: string, width = TICKET_COLUMNS): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      line = "";
      continue;
    }
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const opt = (o: Options | undefined, key: string): boolean => o?.[key] !== false;

interface PreviewItem {
  name: string;
  quantity: number;
  subtotal: number;
  variants: { group: string; option: string }[];
  extras: { name: string; quantity: number; subtotal: number }[];
}

// SAMPLE_ORDER carries the dashboard-side shape (customizations JSON), while
// the printer reads variant_selections + order_item_modifiers. Derive the
// closest equivalents so every item option has something to show.
function toPreviewItems(order: OrderForMessage): PreviewItem[] {
  return (order.order_items ?? []).map((it) => {
    const item: PreviewItem = {
      name: it.burger_name,
      quantity: it.quantity,
      subtotal: it.subtotal,
      variants: [],
      extras: [],
    };
    if (it.customizations) {
      try {
        const data = JSON.parse(it.customizations);
        if (data && !Array.isArray(data)) {
          if (typeof data.meatCount === "number") {
            item.variants.push({ group: "Carnes", option: String(data.meatCount) });
          }
          if (Array.isArray(data.extras)) {
            item.extras = data.extras.map((e: any) => ({
              name: String(e.name),
              quantity: Number(e.quantity) || 1,
              subtotal: (Number(e.price) || 0) * (Number(e.quantity) || 1),
            }));
          }
        }
      } catch {
        /* sample data only: ignore malformed JSON */
      }
    }
    return item;
  });
}

function renderBlock(
  block: TicketBlock,
  order: OrderForMessage,
  businessName: string,
): string[] {
  const o = block.options as Options | undefined;
  const out: string[] = [];

  switch (block.id) {
    case "schedule": {
      if (!order.delivery_time) return out;
      const label = order.delivery_type === "delivery" ? "ENTREGAR" : "RETIRO";
      out.push(center(`${label}: ${order.delivery_time}`), "");
      return out;
    }
    case "logo":
      out.push(center("[ LOGO ]"), "");
      return out;
    case "header": {
      out.push(center(businessName));
      out.push(center(`PEDIDO #${order.order_number}`));
      out.push(center(formatDateTime(order.created_at)));
      out.push(rule(), "");
      return out;
    }
    case "customer": {
      out.push("CLIENTE", "");
      const phone = opt(o, "showPhone") && order.customer?.phone ? `   Tel: ${order.customer.phone}` : "";
      out.push(...wrap(`Nombre: ${order.customer_name}${phone}`));
      out.push("");
      if (opt(o, "showAddress")) {
        const addr = order.customer?.customer_addresses?.find(
          (a) => a.id === order.customer_address_id,
        );
        if (addr?.address) {
          out.push(...wrap(`Dirección: ${addr.address}`));
          if (addr.notes) out.push(...wrap(`  ${addr.notes}`));
        }
      }
      out.push("", rule(), "");
      return out;
    }
    case "items": {
      const prices = opt(o, "showPrices");
      out.push("DETALLE", "");
      for (const item of toPreviewItems(order)) {
        out.push(...wrap(`${item.quantity}x ${item.name}`));
        if (prices) out.push(`Base: ${money(item.subtotal)}`);
        if (opt(o, "showVariants")) {
          for (const v of item.variants) out.push(...wrap(`  ${v.group}: ${v.option}`));
        }
        if (opt(o, "showModifiers")) {
          for (const e of item.extras) {
            out.push(
              ...wrap(`+${e.quantity}x ${e.name}${prices ? ` - +${money(e.subtotal)}` : ""}`),
            );
          }
        }
        const extrasTotal = item.extras.reduce((s, e) => s + e.subtotal, 0);
        if (prices && opt(o, "showModifiers") && extrasTotal > 0) {
          out.push("", `Subtotal: ${money(item.subtotal + extrasTotal)}`);
        }
        out.push("", rule(), "");
      }
      return out;
    }
    case "totals": {
      if (opt(o, "showBreakdown")) {
        const subtotal = order.total_amount + order.discount_amount - order.delivery_fee;
        if (order.discount_amount > 0) {
          out.push(row("Subtotal", money(subtotal)));
          const label =
            order.discount_type === "percentage"
              ? `Desc (${order.discount_value}%)`
              : "Descuento";
          out.push(row(label, `-${money(order.discount_amount)}`));
        }
        if (order.commission_amount > 0) {
          out.push(row("Comisión", `-${money(order.commission_amount)}`));
        }
        if (order.price_adjustment !== 0) {
          const sign = order.price_adjustment > 0 ? "+" : "-";
          out.push(row("Ajuste", `${sign}${money(Math.abs(order.price_adjustment))}`));
        }
        if (order.delivery_fee > 0) {
          out.push(row("Envio", money(order.delivery_fee)));
        }
      }
      out.push(rule());
      out.push(row("TOTAL", money(order.total_amount)));
      out.push(rule(), "");
      return out;
    }
    case "delivery_payment": {
      const delivery = order.delivery_type === "pickup" ? "Retira" : "Envío";
      const payment = order.payment_method === "cash" ? "Efectivo" : "Transferencia";
      out.push(`Entrega: ${delivery}  |  Pago: ${payment}`);
      return out;
    }
    case "notes": {
      if (!order.notes) return out;
      out.push("", rule(), "NOTAS", ...wrap(order.notes));
      return out;
    }
    case "footer": {
      const text = typeof o?.text === "string" ? o.text : DEFAULT_FOOTER_TEXT;
      out.push("", ...wrap(text).map(center));
      return out;
    }
  }
}

export function buildTicketPreview(
  order: OrderForMessage,
  layout: TicketLayout,
  businessName: string,
): string {
  const safe = normalizeTicketLayout(layout);
  const lines: string[] = ["", ""];
  for (const block of safe.blocks) {
    if (!block.enabled) continue;
    lines.push(...renderBlock(block, order, businessName));
  }
  return lines.join("\n");
}
