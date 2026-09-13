"use client";

import { useState } from "react";
import { useCustomers } from "@/lib/hooks/use-customers";
import { CustomerList } from "@/components/customers/customer-list";
import { CustomerDetail } from "@/components/customers/customer-detail";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Search, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";

const PAGE_SIZE = 8;

export function CustomersDashboard() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const isMobile = useIsMobile();

  const { data: customers = [], isLoading } = useCustomers(search);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const paginatedCustomers = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <section className="flex flex-1 flex-col min-h-0">
      <Header
        title="Clientes"
        subtitle="Administrá clientes y sus direcciones"
      />

      {/* FILTER BAR — hidden on mobile when viewing detail */}
      {(!isMobile || !selectedCustomer) && (
        <div className="shrink-0 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o teléfono..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
          </div>
        </div>
      )}

      {/* MAIN */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left panel — full width on mobile list view, hidden on mobile detail view */}
        <div
          className={cn(
            "flex flex-col min-h-0 rounded-md ios-glass bg-card",
            isMobile
              ? selectedCustomer
                ? "hidden"
                : "w-full"
              : "w-96 shrink-0",
          )}
        >
          <div className="shrink-0 p-3 border-b">
            <p className="text-caption text-muted-foreground">
              {customers.length} cliente{customers.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <CustomerList
              customers={paginatedCustomers}
              isLoading={isLoading}
              selectedId={selectedCustomer?.id}
              onSelect={setSelectedCustomer}
            />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-center border-t p-2">
              <div className="ios-glass rounded-full px-4 py-1.5 flex items-center gap-2 bg-card">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ←
                </Button>
                <span className="text-subheadline font-medium">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — full width on mobile detail view, hidden on mobile list view */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto rounded-md ios-glass bg-card mt-10 md:mt-0",
            isMobile ? (selectedCustomer ? "flex-1" : "hidden") : "flex-1",
          )}
        >
          {selectedCustomer ? (
            <>
              {isMobile && (
                <div className="sticky top-0 z-10 flex items-center border-b bg-card px-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Clientes
                  </Button>
                </div>
              )}
              <CustomerDetail
                customer={selectedCustomer}
                onCustomerUpdated={setSelectedCustomer}
                onCustomerDeleted={() => setSelectedCustomer(null)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Users className="h-12 w-12 opacity-20" />
              <p className="text-subheadline">Seleccioná un cliente para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>

      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setSelectedCustomer}
      />
    </section>
  );
}