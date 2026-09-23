"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-app-settings";
import { deriveAccentPalette, type AccentPalette } from "@/lib/utils/deriveAccentPalette";

// Solo los 5 tokens que este branch YA lee en algún componente
// (grep --accent- en components/ui/button.tsx, components/orders/order-
// card.tsx y order-card-mobile.tsx) entran acá. --accent-pressed y
// --accent-contrast SÍ existen en deriveAccentPalette (jebbs-dashboard los
// define para casos que no llegaron a portarse todavía) pero nada en este
// repo los lee hoy — no se escriben, para no dejar custom properties
// muertas. Si un futuro componente empieza a leer alguno de los dos, se
// agrega su entrada acá en esa misma tanda de trabajo.
const PROPERTY_MAP: Record<"accentBrand" | "hover" | "tint08" | "tint16" | "tint32", string> = {
  accentBrand: "--accent-brand",
  hover: "--accent-hover",
  tint08: "--accent-tint-08",
  tint16: "--accent-tint-16",
  tint32: "--accent-tint-32",
};

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  // Sin useTheme(): este provider tiene que funcionar también en /login, que
  // no tiene ThemeProvider. Lee la clase directo del <html> y se re-suscribe
  // a cambios con un MutationObserver -- así reacciona si el usuario togglea
  // el tema mientras está en el dashboard, donde sí hay un botón para eso.
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(target.classList.contains("dark"));
    });
    observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const baseHex = isDark ? settings.primary_color_dark : settings.primary_color_light;
    const palette = deriveAccentPalette(baseHex, isDark ? "dark" : "light");
    const root = document.documentElement.style;
    for (const key of Object.keys(PROPERTY_MAP) as (keyof typeof PROPERTY_MAP)[]) {
      root.setProperty(PROPERTY_MAP[key], palette[key as keyof AccentPalette]);
    }
  }, [settings.primary_color_light, settings.primary_color_dark, isDark]);

  return <>{children}</>;
}
