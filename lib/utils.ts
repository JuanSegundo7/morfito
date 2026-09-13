import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge no lee app/globals.css, asi que no conoce la rampa
// tipografica custom (text-display...text-amount, definida en el @theme
// de globals.css). Sin este extend, clasifica esos nombres como si fueran
// utilidades de color de texto (mismo grupo que text-muted-foreground,
// text-white, text-[var(--...)]) -- y al mergear "text-caption
// text-muted-foreground" se queda solo con la ultima, descartando el
// tamano en silencio. Pasaba en CUALQUIER combinacion token+color en el
// mismo cn(), que es el patron mas comun del codebase.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-display', 'text-title1', 'text-title2', 'text-title3', 'text-headline',
        'text-body', 'text-callout', 'text-subheadline', 'text-footnote',
        'text-caption', 'text-caption2', 'text-overline', 'text-amount',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
