"use client";

import { useMemo } from "react";
import { buildTicketPreview, TICKET_COLUMNS } from "@/lib/settings/ticket-preview";
import { SAMPLE_ORDER } from "@/lib/settings/sample-order";
import type { TicketLayout } from "@/lib/settings/ticket-layout";

interface TicketPreviewProps {
  layout: TicketLayout;
  businessName: string;
}

export function TicketPreview({ layout, businessName }: TicketPreviewProps) {
  const text = useMemo(
    () => buildTicketPreview(SAMPLE_ORDER, layout, businessName),
    [layout, businessName],
  );

  return (
    <div className="space-y-2">
      <p className="text-caption text-muted-foreground">
        Vista previa con un pedido de ejemplo. Los tamaños de letra del ticket real no se
        reflejan aquí.
      </p>
      <div className="overflow-x-auto rounded-lg border bg-secondary/30 p-3">
        <pre
          aria-label="Vista previa del ticket"
          className="mx-auto font-mono text-[11px] leading-snug"
          style={{ width: `${TICKET_COLUMNS}ch` }}
        >
          {text}
        </pre>
      </div>
    </div>
  );
}
