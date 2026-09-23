// Espejo en TypeScript de los defaults sembrados por
// scripts/048-app-settings.sql — si cambiás uno, cambiá el otro.
//
// Usado como fallback cuando la query de settings no resolvió (loading,
// error, fila faltante) — ver lib/hooks/use-app-settings.ts.
//
// business_name/pickup_address quedan en `null` acá a propósito, igual que
// en la fila sembrada por la migración: no hay un valor de negocio único
// que tenga sentido para un producto white-label. La resolución real
// (settings.business_name ?? project.name ?? "Morfito") vive en
// lib/hooks/use-app-settings.ts's useBusinessName(), no en este archivo.

import type { AppSettings } from "@/lib/types";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  business_name: null,
  pickup_address: null,
  whatsapp_template: `*{{negocio}}*
🧾 *PEDIDO #{{numero}}* · {{fecha}}

👤 *{{cliente}}* · {{metodo_pago}}
{{icono_entrega}} *{{tipo_entrega}}*
📍 {{direccion}}
   {{notas_direccion}}
🕐 {{etiqueta_hora}} a las: *{{hora_entrega}}*

📦 *Detalle*
{{items}}

💰 {{totales}}
*TOTAL: {{total}}*
━━━━━━━━━━━━━━━
📝 {{notas}}
Gracias por tu compra 🙌

*⚠️ POR FAVOR VERIFICAR QUE ESTÉ TODO CORRECTO EN LA ORDEN ⚠️*`,
  delivery_template: `*{{negocio}}*
Nombre Del Cliente: {{cliente}}
📍 Retiro: {{direccion_retiro}}
📍 Entrega: {{entrega}}
💵 Pagar al local: $
💸 Cobrar al cliente: $
🛵 Envío: {{envio}}
🧭 Estado Del Pedido
📱 Tel cliente: {{telefono}}`,
  // Matches the "restaurant_default_delivery_fee" localStorage default this
  // replaces (components/order-wizard/hooks/use-order-settings.ts,
  // app/(dashboard)/precios/page.tsx) — not copied from jebbs, this is
  // morfito's own pre-existing default.
  default_delivery_fee: 2000,
  // Byte-for-byte the current --primary / --sidebar-primary values in
  // app/globals.css (light/dark) — see scripts/048-app-settings.sql.
  primary_color_light: "#007aff",
  primary_color_dark: "#0a84ff",
  logo_url: null,
  delivery_map_url: null,
  // NULL = default layout (scripts/051); useSettings() normalizes it.
  ticket_layout: null,
};
