"use client"

import type React from "react"
import { MotionConfig } from "framer-motion"

// reducedMotion="user" hace que framer-motion respete prefers-reduced-motion
// automaticamente para TODO motion.* en el subarbol -- deja caer transform/
// layout/rotate/scale (las propiedades espaciales) y conserva opacity/color.
// El media query de globals.css ya hace exactamente esto para transiciones
// CSS puras; esto cierra el mismo hueco para lo animado con framer-motion
// (DragOverlay, badge de conteo, layout de las cards del kanban), que antes
// no tenia forma de escuchar la preferencia del usuario.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
