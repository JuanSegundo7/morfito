import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-[var(--input)] h-11 w-full min-w-0 rounded-2xl border border-border px-4 py-3 text-callout transition-all duration-300 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-subheadline file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-subheadline',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ios-shadow-md',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
