"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { useDeliveryMapImage } from "@/lib/hooks/use-delivery-map-image";
import {
  DeliveryZonePolygonOverlay,
  zoneColorMap,
} from "@/components/configuracion/delivery-zone-polygon-overlay";
import {
  DeliveryMapCanvas,
  DeliveryMapGridNote,
} from "@/components/configuracion/delivery-map-canvas";
import type { DeliveryZone } from "@/lib/types";

// Read-only companion to DeliveryZonesCard. Zones come by prop (the parent
// already calls useDeliveryZones(); mutations invalidate ["delivery-zones"],
// so this re-renders live).
interface DeliveryZoneMapPreviewProps {
  zones: DeliveryZone[];
}

export function DeliveryZoneMapPreview({ zones }: DeliveryZoneMapPreviewProps) {
  const map = useDeliveryMapImage();
  // Tracked by zone id so two zones without a shape never highlight together.
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const colors = zoneColorMap(zones);

  const sortedZones = [...zones].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Vista previa del mapa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-muted-foreground -mt-1">
          Así se ven tus zonas sobre el mapa. Pasá el mouse para ver qué fila corresponde a cada
          zona.
        </p>

        <div className="overflow-hidden rounded-lg border border-input bg-secondary/30">
          <DeliveryMapCanvas url={map.url} width={map.width} height={map.height}>
            <DeliveryZonePolygonOverlay
              zones={zones}
              hoveredZoneId={hoveredZoneId}
              width={map.width}
              height={map.height}
              onHoverZone={setHoveredZoneId}
            />
          </DeliveryMapCanvas>
        </div>
        {!map.url && map.isReady && <DeliveryMapGridNote />}

        <ul className="space-y-1">
          {sortedZones.length === 0 && (
            <li className="text-caption text-muted-foreground">Sin zonas todavía</li>
          )}
          {sortedZones.map((zone) => {
            const hasShape = zone.map_polygon !== null;
            // Inactive outweighs "no shape": don't stack both dimmings.
            const rowOpacity = !zone.is_active ? "opacity-50" : !hasShape ? "opacity-70" : "";
            return (
              <li
                key={zone.id}
                className={[
                  "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-caption transition-colors",
                  hoveredZoneId === zone.id ? "bg-secondary/60" : "",
                  rowOpacity,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerEnter={() => setHoveredZoneId(zone.id)}
                onPointerLeave={() => setHoveredZoneId(null)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      colors.has(zone.id) ? "" : "bg-muted-foreground/40",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={colors.has(zone.id) ? { backgroundColor: colors.get(zone.id) } : undefined}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{zone.name}</span>
                  {!hasShape && (
                    <span className="shrink-0 text-muted-foreground/70">(sin forma)</span>
                  )}
                </span>
                <span className="shrink-0 font-medium text-muted-foreground">
                  {formatCurrency(zone.fee)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
