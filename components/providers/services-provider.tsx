"use client";

import { createContext, useContext, type ReactNode } from "react";

// activeServiceKeys: string[] = lista real de servicios activos (control-panel
// respondió ok). null = sin info de gateo (entitlements no disponible o sin
// configurar) -- fail-open, mismo criterio que isNavItemVisible en
// components/layout/sidebar.tsx. undefined (fuera de un ServicesProvider) se
// trata igual que null: nunca romper un componente por falta de provider
// (tests, storybook-like isolation, etc.).
const ServicesContext = createContext<string[] | null | undefined>(undefined);

interface ServicesProviderProps {
  activeServiceKeys: string[] | null;
  children: ReactNode;
}

// activeServiceKeys es un array plano de strings -- cruza el limite server->
// client como prop normal, resuelto una vez por request en
// app/(dashboard)/layout.tsx (reusa el mismo activeServiceKeys que ya
// alimenta a SidebarLayout, sin un fetch nuevo).
export function ServicesProvider({ activeServiceKeys, children }: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={activeServiceKeys}>
      {children}
    </ServicesContext.Provider>
  );
}

/**
 * ¿Está activo el servicio `key` para este proyecto? Fail-open: sin
 * ServicesProvider en el árbol, o con activeServiceKeys === null (misma
 * semántica que AccessVerdict -- entitlements no disponible), devuelve
 * true. A diferencia de SERVICE_NAV_HREFS (que oculta ítems de nav/rutas
 * enteras), esto es para gatear SECCIONES dentro de una página que ya es
 * visible -- primer caso de uso: la card de "canal de venta" en el wizard,
 * "revenue by source" en rendimiento, y el editor de canales en precios,
 * todas detrás de `order_source_commission`.
 *
 * Nunca usar esto para una decisión de seguridad real (eso ya lo hace
 * middleware.ts a nivel de ruta) -- es solo mostrar/ocultar UI según el
 * plan contratado.
 */
export function useHasService(key: string): boolean {
  const activeServiceKeys = useContext(ServicesContext);
  if (activeServiceKeys == null) return true;
  return activeServiceKeys.includes(key);
}
