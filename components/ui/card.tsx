import * as React from "react";

import { cn } from "@/lib/utils";

type CardDepth = "flat" | "raised" | "hero";

// La escalera de profundidad completa está documentada en app/globals.css,
// cerca de las utilities ios-shadow-*.
const depthClasses: Record<CardDepth, string> = {
  flat: "ios-glass",
  raised: "ios-glass ios-shadow-sm",
  hero: "ios-glass ios-shadow-md [border-top-color:var(--specular-strong)]",
};

interface CardProps extends React.ComponentProps<"div"> {
  /** flat = sin sombra (superficie anidada); raised = default actual;
   *  hero = peso visual para el stat que importa más de la pantalla. */
  depth?: CardDepth;
  /** Activa hover (lift) y press (compresión) reales. Solo para cards
   *  que de verdad son un objeto tocable/arrastrable — no decoración. */
  interactive?: boolean;
}

function Card({
  className,
  depth = "raised",
  interactive = false,
  onPointerDown,
  style,
  ...props
}: CardProps) {
  const [pressOrigin, setPressOrigin] = React.useState<string | undefined>();

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (interactive) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPressOrigin(`${x}% ${y}%`);
    }
    onPointerDown?.(e);
  };

  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-2xl py-6",
        depthClasses[depth],
        // Default de siempre: sin regresión en los ~150 call sites que no
        // pasan interactive. La misma clase, letra por letra, que había acá.
        !interactive &&
          depth === "raised" &&
          "transition-shadow duration-200 hover:ios-shadow-md",
        // Hover = lift (sube + sombra más profunda + canto más brillante),
        // no solo un cambio de sombra. Press = se comprime hacia la
        // superficie (vuelve a 0 + sombra sm + scale), no solo se achica.
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:ios-shadow-md hover:-translate-y-[2px] hover:[border-top-color:var(--specular-strong)] active:translate-y-0 active:scale-[0.985] active:ios-shadow-sm active:duration-[90ms]",
        className
      )}
      style={{
        ...(interactive && pressOrigin ? { transformOrigin: pressOrigin } : {}),
        ...style,
      }}
      onPointerDown={handlePointerDown}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-headline", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-subheadline", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
