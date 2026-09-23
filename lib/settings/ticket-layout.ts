// Per-business thermal ticket layout, stored in app_settings.ticket_layout
// (scripts/051-ticket-layout.sql). NULL in the DB means "default layout",
// which reproduces the historical fixed ticket exactly.
//
// COUNTERPART: morfito-print-service/src/printer/ticket-layout.ts holds a
// hand-copied version of the types, DEFAULT_TICKET_LAYOUT and
// normalizeTicketLayout. Keep both in sync when a block or option changes.
// normalizeTicketLayout is deliberately tolerant (unknown ids dropped, new
// blocks appended disabled) so a dashboard and a print service on different
// versions still agree on something printable.

export type TicketBlockId =
  | "schedule"
  | "logo"
  | "header"
  | "customer"
  | "items"
  | "totals"
  | "delivery_payment"
  | "notes"
  | "footer";

export type TicketOptionValue = boolean | string;

export interface TicketBlock {
  id: TicketBlockId;
  enabled: boolean;
  options?: Record<string, TicketOptionValue>;
}

export interface TicketLayout {
  version: 1;
  // Array order = print order.
  blocks: TicketBlock[];
}

export interface TicketOptionDef {
  key: string;
  label: string;
  type: "boolean" | "text";
  default: TicketOptionValue;
}

export interface TicketBlockMeta {
  label: string;
  description: string;
  options: TicketOptionDef[];
}

export const DEFAULT_FOOTER_TEXT = "Gracias por elegirnos!";

export const BLOCK_META: Record<TicketBlockId, TicketBlockMeta> = {
  schedule: {
    label: "Horario",
    description: "Hora de entrega o de retiro, destacada en la parte superior.",
    options: [],
  },
  logo: {
    label: "Logo",
    description: "Logo del negocio, centrado.",
    options: [],
  },
  header: {
    label: "Encabezado",
    description: "Nombre del negocio, número de pedido y fecha.",
    options: [],
  },
  customer: {
    label: "Cliente",
    description: "Nombre del cliente y, opcionalmente, teléfono y dirección.",
    options: [
      { key: "showPhone", label: "Mostrar teléfono", type: "boolean", default: true },
      { key: "showAddress", label: "Mostrar dirección", type: "boolean", default: true },
    ],
  },
  items: {
    label: "Detalle del pedido",
    description: "Productos pedidos, con sus variantes y adicionales.",
    options: [
      { key: "showPrices", label: "Mostrar precios", type: "boolean", default: true },
      { key: "showVariants", label: "Mostrar variantes", type: "boolean", default: true },
      { key: "showModifiers", label: "Mostrar adicionales", type: "boolean", default: true },
      { key: "largeText", label: "Nombre del producto en tamaño grande", type: "boolean", default: true },
    ],
  },
  totals: {
    label: "Totales",
    description: "Total del pedido, con o sin el desglose.",
    options: [
      {
        key: "showBreakdown",
        label: "Mostrar desglose (subtotal, descuento, comisión, ajuste, envío)",
        type: "boolean",
        default: true,
      },
    ],
  },
  delivery_payment: {
    label: "Entrega y pago",
    description: "Tipo de entrega y método de pago.",
    options: [],
  },
  notes: {
    label: "Notas",
    description: "Notas del pedido. Solo se imprime si el pedido tiene notas.",
    options: [],
  },
  footer: {
    label: "Pie",
    description: "Mensaje final del ticket.",
    options: [
      { key: "text", label: "Texto del pie", type: "text", default: DEFAULT_FOOTER_TEXT },
    ],
  },
};

const DEFAULT_ORDER: TicketBlockId[] = [
  "schedule",
  "logo",
  "header",
  "customer",
  "items",
  "totals",
  "delivery_payment",
  "notes",
  "footer",
];

function isKnownId(value: unknown): value is TicketBlockId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BLOCK_META, value);
}

function defaultOptions(id: TicketBlockId): Record<string, TicketOptionValue> | undefined {
  const defs = BLOCK_META[id].options;
  if (defs.length === 0) return undefined;
  return Object.fromEntries(defs.map((d) => [d.key, d.default]));
}

function coerceOptions(
  id: TicketBlockId,
  raw: unknown,
): Record<string, TicketOptionValue> | undefined {
  const defs = BLOCK_META[id].options;
  if (defs.length === 0) return undefined;
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    defs.map((d) => {
      const v = source[d.key];
      const ok = d.type === "boolean" ? typeof v === "boolean" : typeof v === "string";
      return [d.key, ok ? (v as TicketOptionValue) : d.default];
    }),
  );
}

function buildDefault(): TicketLayout {
  return {
    version: 1,
    blocks: DEFAULT_ORDER.map((id) => {
      const options = defaultOptions(id);
      return options ? { id, enabled: true, options } : { id, enabled: true };
    }),
  };
}

export const DEFAULT_TICKET_LAYOUT: TicketLayout = buildDefault();

export function normalizeTicketLayout(raw: unknown): TicketLayout {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { blocks?: unknown }).blocks)) {
    return buildDefault();
  }

  const seen = new Set<TicketBlockId>();
  const blocks: TicketBlock[] = [];
  for (const entry of (raw as { blocks: unknown[] }).blocks) {
    if (!entry || typeof entry !== "object") continue;
    const { id, enabled, options } = entry as Record<string, unknown>;
    if (!isKnownId(id) || seen.has(id)) continue;
    seen.add(id);
    const opts = coerceOptions(id, options);
    blocks.push(
      opts
        ? { id, enabled: enabled === true, options: opts }
        : { id, enabled: enabled === true },
    );
  }

  // Nothing usable in the stored value: behave as if it was never set.
  if (blocks.length === 0) return buildDefault();

  for (const id of DEFAULT_ORDER) {
    if (seen.has(id)) continue;
    const options = defaultOptions(id);
    blocks.push(options ? { id, enabled: false, options } : { id, enabled: false });
  }

  return { version: 1, blocks };
}
