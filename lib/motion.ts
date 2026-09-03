import { type Transition, type Variants, useReducedMotion } from "framer-motion";

/**
 * El set de springs de la casa. Mapeo del apple-design skill (§4):
 * damping 1.0 -> bounce 0, damping 0.8 -> bounce ~0.2, response -> duration.
 *
 * Regla de la casa: bounce 0 por defecto. El overshoot se gana — solo
 * donde el gesto trajo momentum. Un menú que apareció con un fade no rebota.
 */
export const springs = {
  /** El dedo está encima ahora. */
  press: { type: "spring", bounce: 0, duration: 0.22 } satisfies Transition,
  /** El default: move/reposition de Apple. */
  move: { type: "spring", bounce: 0, duration: 0.4 } satisfies Transition,
  /** Superficies grandes asentándose. */
  settle: { type: "spring", bounce: 0, duration: 0.55 } satisfies Transition,
  /** Drawer/sheet. */
  sheet: { type: "spring", bounce: 0.2, duration: 0.3 } satisfies Transition,
  /** Levantar bajo el cursor. */
  lift: { type: "spring", bounce: 0.15, duration: 0.26 } satisfies Transition,
  /** Algo que el usuario lanzó. */
  toss: { type: "spring", bounce: 0.25, duration: 0.38 } satisfies Transition,
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof springs;

/** Tween de reemplazo cuando prefers-reduced-motion está activo (§14):
 *  un equivalente MÁS SUAVE, no ausencia de feedback. */
const reducedMotionTransition: Transition = {
  type: "tween",
  duration: 0.16,
  ease: "easeOut",
};

/**
 * Devuelve la transición nombrada, o un tween de 160ms si el usuario
 * pidió reduced motion. Un solo hook: los componentes no ramifican
 * individualmente sobre useReducedMotion().
 */
export function useSpring(name: SpringName): Transition {
  const reduced = useReducedMotion();
  return reduced ? reducedMotionTransition : springs[name];
}

/**
 * Materialize (§12): una superficie condensándose desde el vidrio.
 * Anima blur + escala + opacidad juntos, no por separado.
 */
export const materialize: Variants = {
  initial: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: springs.settle,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    filter: "blur(4px)",
    transition: { ...springs.move, duration: 0.22 },
  },
};

/** Presence de una tarjeta en una lista (order-column): entra empujando,
 *  sale encogiéndose y cerrando el hueco. */
export const cardPresence: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springs.move,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    transition: springs.move,
  },
};

/**
 * Par de curvas espejadas (§7): una transición reversible tiene que
 * espejar su easing en el camino de vuelta, o no se siente como
 * "un lugar" al que entrás y salís.
 */
export const easeOutIOS = [0.16, 1, 0.3, 1] as const;
export const easeInIOS = [0.7, 0, 0.84, 0] as const;
