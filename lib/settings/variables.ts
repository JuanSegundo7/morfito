// Catálogo de variables disponibles para whatsapp_template / delivery_template
// (ver lib/settings/defaults.ts y scripts/048-app-settings.sql). Usado para
// renderizar tooltips/autocomplete en el editor de plantillas (Fase 2) y para
// resolver los placeholders {{var}} al armar el mensaje real de un pedido —
// ver lib/utils/formatOrderWhatsapp.ts's buildOrderMessageVars, el único
// lugar que efectivamente resuelve estos nombres.
//
// linea_comision es la única variable sin equivalente directo en el
// catálogo que portamos de jebbs-dashboard: jebbs tenía una sola comisión
// fija de PedidosYa (linea_ajuste ahí significaba eso); morfito ya tiene un
// modelo de comisión por canal más rico (lib/utils/commission.ts), separado
// de price_adjustment — así que acá son dos líneas independientes.

export interface OrderMessageVar {
  name: string; // "cliente", sin las llaves
  label: string; // "Nombre del cliente"
  example: string; // valor de ejemplo para el tooltip
  multiline?: boolean; // true solo para items y totales
}

export const ORDER_MESSAGE_VARS: OrderMessageVar[] = [
  { name: "negocio", label: "Nombre del negocio", example: "Morfito" },
  { name: "numero", label: "Número de pedido", example: "1042" },
  { name: "fecha", label: "Fecha y hora del pedido", example: "20/09/2026 14:30" },
  { name: "cliente", label: "Nombre del cliente", example: "Juan Pérez" },
  { name: "telefono", label: "Teléfono del cliente", example: "+54 9 11 1234-5678" },
  { name: "metodo_pago", label: "Método de pago", example: "💵 Efectivo" },
  { name: "icono_entrega", label: "Ícono de entrega", example: "🚚" },
  { name: "tipo_entrega", label: "Tipo de entrega", example: "Envío a domicilio" },
  { name: "direccion", label: "Dirección de entrega", example: "Av. Siempreviva 742" },
  { name: "notas_direccion", label: "Notas de la dirección", example: "Timbre roto, tocar bocina" },
  { name: "etiqueta_hora", label: "Etiqueta de hora (Entregar/Retirar)", example: "Entregar" },
  { name: "hora_entrega", label: "Hora de entrega o retiro", example: "15:00" },
  { name: "entrega", label: "Dirección de entrega o 'Retira en local'", example: "Av. Siempreviva 742" },
  { name: "direccion_retiro", label: "Dirección de retiro del local", example: "Av. Principal 123" },
  { name: "envio", label: "Costo de envío", example: "$ 2.000" },
  { name: "total", label: "Total del pedido", example: "$ 12.500" },
  { name: "notas", label: "Notas del pedido", example: "Sin cebolla en todas" },
  { name: "linea_subtotal", label: "Línea de subtotal", example: "Subtotal $ 10.000" },
  { name: "linea_envio", label: "Línea de envío (se oculta si es $0)", example: "Envío $ 2.000" },
  { name: "linea_descuento", label: "Línea de descuento (se oculta si no hay)", example: "Desc. 10% -$ 1.200" },
  { name: "linea_comision", label: "Línea de comisión del canal de venta (se oculta si es $0)", example: "Comisión -$ 400" },
  { name: "linea_ajuste", label: "Línea de ajuste manual de precio (se oculta si es $0)", example: "Ajuste +$ 500" },
  { name: "items", label: "Detalle de items del pedido", example: "• 2x Plato Principal — $ 8.000", multiline: true },
  { name: "totales", label: "Totales combinados (subtotal · envío · descuento · comisión · ajuste)", example: "Subtotal $ 10.000 · Envío $ 2.000", multiline: true },
];
