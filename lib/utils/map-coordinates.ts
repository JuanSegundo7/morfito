// Delivery-zone polygons are stored as PER-MILLE of the map image size:
// [x, y] with both in 0..1000 (x = fraction of width * 1000, y = fraction
// of height * 1000). The overlay/editor SVGs use viewBox="0 0 W H" where
// W/H are the image's natural size, so these helpers convert between the
// two spaces. See scripts/050-delivery-zone-polygons.sql.

export const PER_MILLE_MAX = 1000;

// Fixed canvas used when the tenant has not uploaded a map image yet.
export const FALLBACK_MAP_WIDTH = 1600;
export const FALLBACK_MAP_HEIGHT = 900;

export type PerMillePoint = [number, number];

function clampPerMille(n: number): number {
  return Math.min(PER_MILLE_MAX, Math.max(0, n));
}

// per-mille -> viewBox units
export function toViewBoxPoint(
  point: PerMillePoint,
  width: number,
  height: number,
): [number, number] {
  return [(point[0] / PER_MILLE_MAX) * width, (point[1] / PER_MILLE_MAX) * height];
}

// viewBox units -> per-mille, clamped to 0..1000
export function fromViewBoxPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): PerMillePoint {
  return [
    clampPerMille((x / width) * PER_MILLE_MAX),
    clampPerMille((y / height) * PER_MILLE_MAX),
  ];
}

// "x,y x,y ..." string for <polygon>/<polyline> `points`
export function toSvgPointsAttr(
  points: PerMillePoint[],
  width: number,
  height: number,
): string {
  return points
    .map((p) => toViewBoxPoint(p, width, height).join(","))
    .join(" ");
}
