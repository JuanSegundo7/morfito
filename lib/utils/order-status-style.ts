import type React from "react";
import type { OrderStatus } from "@/lib/types";

// Extraído de order-card.tsx / order-card-mobile.tsx, que lo tenían
// duplicado byte a byte — dato puro, ambos archivos importan de acá
// para no volver a divergir.
export const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  new: { label: "Nuevo", className: "bg-[var(--status-new-tint)] text-[var(--status-new)]" },
  ready: { label: "Listo", className: "bg-[var(--status-ready-tint)] text-[var(--status-ready)]" },
  completed: { label: "Completado", className: "bg-[var(--status-completed-tint)] text-[var(--status-completed)]" },
  canceled: { label: "Cancelado", className: "bg-[var(--status-canceled-tint)] text-[var(--status-canceled)]" },
};

// El estado como luz (status-edge, ver globals.css): cada valor fija las
// custom properties que la utility lee, en vez de una franja de color plana.
export const statusEdgeStyle: Record<OrderStatus, React.CSSProperties> = {
  new: { "--status-color": "var(--status-new)", "--status-tint": "var(--status-new-tint)" } as React.CSSProperties,
  ready: { "--status-color": "var(--status-ready)", "--status-tint": "var(--status-ready-tint)" } as React.CSSProperties,
  completed: { "--status-color": "var(--status-completed)", "--status-tint": "var(--status-completed-tint)" } as React.CSSProperties,
  canceled: { "--status-color": "var(--status-canceled)", "--status-tint": "var(--status-canceled-tint)" } as React.CSSProperties,
};
