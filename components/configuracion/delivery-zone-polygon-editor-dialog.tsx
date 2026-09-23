"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateDeliveryZone } from "@/lib/hooks/use-delivery-zones";
import { useDeliveryMapImage } from "@/lib/hooks/use-delivery-map-image";
import {
  fromViewBoxPoint,
  toSvgPointsAttr,
  toViewBoxPoint,
  type PerMillePoint,
} from "@/lib/utils/map-coordinates";
import {
  DeliveryMapCanvas,
  DeliveryMapGridNote,
} from "@/components/configuracion/delivery-map-canvas";
import type { DeliveryZone } from "@/lib/types";

interface DeliveryZonePolygonEditorDialogProps {
  zone: DeliveryZone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_POINTS = 3;

// Browser pointer -> this SVG's own coordinate space via the native CTM, NOT
// manual bounding-rect math (which breaks when the rendered box's aspect
// ratio differs from the viewBox's).
function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const transformed = pt.matrixTransform(ctm.inverse());
  return [transformed.x, transformed.y];
}

export function DeliveryZonePolygonEditorDialog({
  zone,
  open,
  onOpenChange,
}: DeliveryZonePolygonEditorDialogProps) {
  const map = useDeliveryMapImage();
  const updateZone = useUpdateDeliveryZone();

  const overlayRef = useRef<SVGSVGElement>(null);
  // Points are held in per-mille (the stored model); converted to viewBox
  // units only for drawing.
  const [points, setPoints] = useState<PerMillePoint[]>(zone.map_polygon ?? []);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // Reset the local draft whenever the dialog opens (or for another zone) so
  // a cancel doesn't leave stale in-progress points for next time.
  useEffect(() => {
    if (open) {
      setPoints(zone.map_polygon ?? []);
      setDraggingIndex(null);
    }
  }, [zone.id, open, zone.map_polygon]);

  const hadPolygonOnOpen = zone.map_polygon !== null;

  const pointerToPerMille = (clientX: number, clientY: number): PerMillePoint | null => {
    const svg = overlayRef.current;
    if (!svg) return null;
    const p = toSvgPoint(svg, clientX, clientY);
    if (!p) return null;
    return fromViewBoxPoint(p[0], p[1], map.width, map.height);
  };

  // Adding a point: click anywhere that isn't a vertex handle. Vertex
  // pointerdown calls stopPropagation, so this never fires when starting a drag.
  const handleBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const next = pointerToPerMille(e.clientX, e.clientY);
    if (!next) return;
    setPoints((prev) => [...prev, next]);
  };

  const handleVertexPointerDown = (index: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    setDraggingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleVertexPointerMove = (index: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingIndex !== index) return;
    const next = pointerToPerMille(e.clientX, e.clientY);
    if (!next) return;
    setPoints((prev) => prev.map((p, i) => (i === index ? next : p)));
  };

  const handleVertexPointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingIndex(null);
  };

  const deleteVertex = (index: number) => {
    if (points.length <= MIN_POINTS) {
      toast.error(`Una zona necesita al menos ${MIN_POINTS} puntos para formar una figura`);
      return;
    }
    setPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (points.length < MIN_POINTS) {
      toast.error("Dibujá al menos 3 puntos para cerrar una forma");
      return;
    }
    updateZone.mutate(
      { id: zone.id, map_polygon: points },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleClearShape = () => {
    updateZone.mutate(
      { id: zone.id, map_polygon: null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const shapeIsClosed = points.length >= MIN_POINTS;
  const pointsAttr = toSvgPointsAttr(points, map.width, map.height);
  // Keep handles/strokes the same visual size regardless of image resolution.
  const unit = Math.max(map.width, map.height) / 1000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dibujar forma: {zone.name}</DialogTitle>
        </DialogHeader>

        <p className="text-caption text-muted-foreground -mt-2">
          Hacé click sobre el mapa para agregar puntos. Arrastrá un punto ya puesto para
          ajustarlo. Necesitás al menos {MIN_POINTS} puntos para formar una figura.
        </p>

        <div className="overflow-hidden rounded-lg border border-input bg-secondary/30">
          <DeliveryMapCanvas url={map.url} width={map.width} height={map.height}>
            <svg
              ref={overlayRef}
              viewBox={`0 0 ${map.width} ${map.height}`}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
              onPointerDown={handleBackgroundPointerDown}
            >
              {shapeIsClosed ? (
                <polygon
                  points={pointsAttr}
                  fill="var(--chart-1)"
                  fillOpacity={0.25}
                  stroke="var(--chart-1)"
                  strokeWidth={2 * unit}
                />
              ) : (
                points.length > 1 && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth={2 * unit}
                  />
                )
              )}
              {points.map((point, index) => {
                const [cx, cy] = toViewBoxPoint(point, map.width, map.height);
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={8 * unit}
                    fill="var(--chart-1)"
                    stroke="var(--background)"
                    strokeWidth={2 * unit}
                    className="cursor-grab touch-none"
                    onPointerDown={handleVertexPointerDown(index)}
                    onPointerMove={handleVertexPointerMove(index)}
                    onPointerUp={handleVertexPointerUp}
                  />
                );
              })}
            </svg>
          </DeliveryMapCanvas>
        </div>
        {!map.url && map.isReady && <DeliveryMapGridNote />}

        {points.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {points.map(([x, y], index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-md bg-secondary/30 px-2 py-1 text-caption"
              >
                <span>
                  Vértice {index + 1} ({Math.round(x)}, {Math.round(y)})
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => deleteVertex(index)}
                  disabled={points.length <= MIN_POINTS}
                  title="Borrar vértice"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:justify-between">
          <div>
            {hadPolygonOnOpen && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={handleClearShape}
                disabled={updateZone.isPending}
              >
                Borrar forma
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updateZone.isPending}>
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
