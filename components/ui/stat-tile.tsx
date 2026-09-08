"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { Variants } from "framer-motion";

import { Card, CardContent } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpring } from "@/lib/motion";
import { cn } from "@/lib/utils";

// NO usa `materialize` (blur+escala) a propósito: ese variant es para
// vidrio que condensa en momentos raros (§12). Este tile recarga cada vez
// que cambiás de período en /finanzas — con react-query armando una
// queryKey nueva por fecha, eso es "isLoading" en cada click de
// Anterior/Siguiente, no una vez. Animar blur() en ~4 tiles a la vez, ahí,
// se sentía como lag real (medido: el usuario lo reportó tras este cambio).
// Solo opacity — barato, sin forzar compositing nuevo por tile.
const tileFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

interface StatTileProps {
  icon: LucideIcon;
  color: string;
  value: string;
  label: string;
  valueColor?: string;
  /** hero = el stat que más importa de la pantalla (depth="hero" + text-display). */
  emphasis?: "normal" | "hero";
  delta?: ReactNode;
  loading?: boolean;
  className?: string;
}

// El skeleton tiene la misma forma que el contenido (chip + valor + label)
// para que el swap loading->loaded tenga de dónde materializar (§12: blur+
// escala juntos, no solo un fade) en vez de saltar entre cajas distintas.
export function StatTile({
  icon,
  color,
  value,
  label,
  valueColor,
  emphasis = "normal",
  delta,
  loading = false,
  className,
}: StatTileProps) {
  const transition = useSpring("settle");
  const isHero = emphasis === "hero";

  return (
    <Card depth={isHero ? "hero" : "raised"} className={cn("p-0", className)}>
      <CardContent className="p-4">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.div
              key="skeleton"
              variants={tileFade}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transition}
            >
              <Skeleton className="mb-2 size-7 rounded-sm" />
              <Skeleton className={cn("mb-1", isHero ? "h-8 w-32" : "h-6 w-20")} />
              <Skeleton className="h-3 w-24" />
            </motion.div>
          ) : (
            <motion.div
              key="content"
              variants={tileFade}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={transition}
            >
              <div className="mb-2 flex items-center justify-between">
                <IconChip icon={icon} color={color} />
                {delta}
              </div>
              <p
                className={cn(
                  isHero ? "text-display" : "text-amount",
                  "numeric vibrant",
                )}
                style={valueColor ? { color: valueColor } : undefined}
              >
                {value}
              </p>
              <p className="text-caption text-muted-foreground mt-0.5 truncate">{label}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
