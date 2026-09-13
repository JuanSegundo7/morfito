"use client";

import { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone } from "lucide-react";

interface CustomerListProps {
  customers: Customer[];
  isLoading: boolean;
  selectedId?: string;
  onSelect: (customer: Customer) => void;
}

export function CustomerList({
  customers,
  isLoading,
  selectedId,
  onSelect,
}: CustomerListProps) {
  if (isLoading) {
    return (
      <div className="p-2 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="p-8 text-center text-subheadline text-muted-foreground">
        No se encontraron clientes
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {customers.map((customer) => (
        <button
          key={customer.id}
          onClick={() => onSelect(customer)}
          className={cn(
            "w-full text-left p-3 rounded-lg transition-colors hover:bg-muted/60",
            selectedId === customer.id && "bg-muted ring-1 ring-primary/30",
          )}
        >
          <p className="font-medium text-subheadline truncate">{customer.name}</p>
          {customer.phone && (
            <p className="text-caption text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}