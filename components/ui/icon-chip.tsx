import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface IconChipProps {
  icon: LucideIcon;
  /** CSS color or `var(--...)` string — same value callers already pass
   *  as `chipColor`/`tile.chipColor` today. */
  color: string;
  className?: string;
}

// size-7 (28px) con rounded-sm (--radius-sm = 10px, derivado de --radius):
// 10px sobre 28px es ~36% de radio, un escalón más cuadrado que el 16px
// sobre ~320px de una card (~5%) — la proporción correcta para un chip
// chico, no el rounded-md (12px) que se usaba antes por descuido.
export function IconChip({ icon: Icon, color, className }: IconChipProps) {
  return (
    <div
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-sm border", className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color }} />
    </div>
  );
}
