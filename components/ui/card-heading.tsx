import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { IconChip } from "@/components/ui/icon-chip";

interface CardHeadingProps {
  icon: LucideIcon;
  iconColor: string;
  children: ReactNode;
  /** Elemento a la derecha de la fila — total, botón de exportar, etc. */
  action?: ReactNode;
  className?: string;
}

// Vive DENTRO de CardContent, no en CardHeader: CardHeader trae su propio
// px-6 y un grid de dos filas que pelea con el patrón p-0 + CardContent p-4
// que estas cards ya usan. h3 en vez del <p> anterior — mejora real de
// accesibilidad, no solo cosmética.
export function CardHeading({ icon, iconColor, children, action, className }: CardHeadingProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 mb-3", className)}>
      <div className="flex items-center gap-2 min-w-0">
        <IconChip icon={icon} color={iconColor} />
        <h3 className="text-headline truncate">{children}</h3>
      </div>
      {action}
    </div>
  );
}
