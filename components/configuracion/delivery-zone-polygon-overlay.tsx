"use client";

import { toSvgPointsAttr } from "@/lib/utils/map-coordinates";
import type { DeliveryZone } from "@/lib/types";

// Read-only SVG layer that draws hand-drawn zone shapes (map_polygon) on top
// of the map image / grid. Pure presentation — drag/click editing lives in
// DeliveryZonePolygonEditorDialog, which renders its own interactive overlay.
// viewBox is the image's natural size (width/height), points are per-mille.
interface DeliveryZonePolygonOverlayProps {
  zones: DeliveryZone[];
  hoveredZoneId: string | null;
  width: number;
  height: number;
  // When passed, each polygon becomes hoverable and reports its zone id.
  onHoverZone?: (id: string | null) => void;
}

export const ZONE_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Color by position among zones that HAVE a polygon, sorted by sort_order,
// so the legend dot and the drawn shape always agree.
export function zoneColorMap(zones: DeliveryZone[]): Map<string, string> {
  const map = new Map<string, string>();
  [...zones]
    .filter((z) => z.map_polygon !== null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((z, i) => map.set(z.id, ZONE_CHART_COLORS[i % ZONE_CHART_COLORS.length]));
  return map;
}

export function DeliveryZonePolygonOverlay({
  zones,
  hoveredZoneId,
  width,
  height,
  onHoverZone,
}: DeliveryZonePolygonOverlayProps) {
  const colors = zoneColorMap(zones);
  const polygonZones = zones.filter(
    (z): z is DeliveryZone & { map_polygon: [number, number][] } =>
      z.map_polygon !== null && z.is_active,
  );
  // Stroke widths scale with the image so they look the same on any
  // resolution (viewBox units are image pixels).
  const unit = Math.max(width, height) / 1000;

  return (
    // pointer-events-none ALWAYS on the root: a root with pointer-events-auto
    // swallowed hover on everything beneath it (real bug found in jebbs).
    // Each <polygon> re-enables pointer events on its own, only when hover is
    // wanted, so it only captures its own shape.
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {polygonZones.map((zone) => {
        const color = colors.get(zone.id) ?? ZONE_CHART_COLORS[0];
        const isHovered = hoveredZoneId === zone.id;
        return (
          <polygon
            key={zone.id}
            points={toSvgPointsAttr(zone.map_polygon, width, height)}
            fill={color}
            fillOpacity={isHovered ? 0.45 : 0.22}
            stroke={color}
            strokeWidth={(isHovered ? 3 : 1.5) * unit}
            className={onHoverZone ? "pointer-events-auto cursor-pointer" : undefined}
            onPointerEnter={onHoverZone ? () => onHoverZone(zone.id) : undefined}
            onPointerLeave={onHoverZone ? () => onHoverZone(null) : undefined}
          />
        );
      })}
    </svg>
  );
}
