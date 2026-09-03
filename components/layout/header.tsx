"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { PrintServiceIndicator } from "../order-wizard/components/print-service";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onCreateOrder?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  extraActions?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  onCreateOrder,
  onRefresh,
  isRefreshing,
  extraActions,
}: HeaderProps) {
  return (
    <header className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6 material-regular rounded-2xl shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-title text-foreground">{title}</h1>
          {subtitle && (
            <p className="hidden text-footnote text-muted-foreground sm:block">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <PrintServiceIndicator />

        {extraActions}

        <ThemeToggle />

        {onCreateOrder && (
          <Button onClick={onCreateOrder} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Crear Pedido
          </Button>
        )}
      </div>
    </header>
  );
}
