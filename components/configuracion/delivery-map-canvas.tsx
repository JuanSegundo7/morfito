"use client";

import type { ReactNode } from "react";

// Shared background for the zone preview and the polygon editor: the
// tenant's map image, or a fixed-ratio grid when none is uploaded. Children
// (the SVG overlays) are absolutely positioned on top and must use
// viewBox="0 0 width height" with the same width/height passed here.
interface DeliveryMapCanvasProps {
  url: string | null;
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
}

export function DeliveryMapCanvas({
  url,
  width,
  height,
  children,
  className,
}: DeliveryMapCanvasProps) {
  return (
    <div
      className={["relative w-full overflow-hidden", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "6.25% 11.111%",
          }}
        />
      )}
      {children}
    </div>
  );
}

export function DeliveryMapGridNote() {
  return (
    <p className="text-caption text-muted-foreground">
      Subí una imagen del mapa en la tab Envíos para dibujar sobre tu zona real
    </p>
  );
}
