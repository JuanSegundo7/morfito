"use client";

import type React from "react";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useRef } from "react";
import { AppSidebar } from "./sidebar";

export function SidebarLayout({
  children,
  activeServiceKeys,
}: Readonly<{
  children: React.ReactNode;
  /** Active service keys for sidebar gating; `null` disables gating (fail-open). */
  activeServiceKeys?: string[] | null;
}>) {
  const { setOpen, isMobile } = useSidebar();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleHoverStart = () => {
    if (!isMobile && window.matchMedia("(hover: hover)").matches) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOpen(true);
    }
  };

  const handleHoverEnd = () => {
    if (!isMobile && window.matchMedia("(hover: hover)").matches) {
      timeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 250);
    }
  };

  return (
    <>
      {/* initial={false}+animate={{opacity:1}} no tenia ninguna propiedad
          para interpolar -- era un no-op de framer-motion. Lo unico real
          acá es la deteccion de hover para expandir/colapsar el sidebar. */}
      <div onPointerEnter={handleHoverStart} onPointerLeave={handleHoverEnd}>
        <AppSidebar activeServiceKeys={activeServiceKeys} />
      </div>
      <SidebarInset>
        <main className="flex flex-1 flex-col overflow-y-auto p-4 md:p-2 container mx-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
