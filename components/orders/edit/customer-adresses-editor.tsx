"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateCustomerAddress,
  useDeleteCustomerAddress,
  useSetDefaultAddress,
} from "@/lib/hooks/use-customers";
import { Trash2, Star, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function CustomerAddressesEditor({
  customerId,
  addresses,
  isLoading,
  selectedAddressId,
  onSelect,
}: {
  customerId: string;
  addresses: any[];
  isLoading: boolean;
  selectedAddressId?: string;
  onSelect: (addr: any) => void;
}) {
  const createAddress = useCreateCustomerAddress();
  const deleteAddress = useDeleteCustomerAddress(customerId);
  const setDefault = useSetDefaultAddress();

  const [isAdding, setIsAdding] = useState(false);
  const [newAddress, setNewAddress] = useState("");

  const handleSave = () => {
    if (!newAddress.trim()) return;

    createAddress.mutate(
      {
        customerId, // 👈 esto faltaba
        address: newAddress,
        label: "Nueva",
        is_default: addresses.length === 0,
      },
      {
        onSuccess: (data: any) => {
          setIsAdding(false);
          setNewAddress("");
          if (data?.id) onSelect(data);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 border rounded-md p-2 bg-card"
          >
            {/* Texto dirección */}
            <Skeleton className="h-4 flex-1 rounded" />

            {/* Botón default */}
            <Skeleton className="h-8 w-8 rounded-md" />

            {/* Botón delete */}
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">Direcciones</h4>

        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {/* Nueva dirección */}
      {isAdding && (
        <div className="flex items-center gap-2 border rounded-md p-2 bg-card">
          <input
            autoFocus
            className="flex-1 text-sm border-none outline-none bg-transparent text-foreground"
            placeholder="Ingresar dirección"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />

          <Button size="icon" onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsAdding(false);
              setNewAddress("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Direcciones */}
      {addresses.map((addr) => {
        const isSelected = selectedAddressId === addr.id;

        return (
          <div
            key={addr.id}
            onClick={() => onSelect(addr)}
            className={cn(
              "flex items-center gap-2 border rounded-md p-2 cursor-pointer transition",
              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted",
            )}
          >
            {/* Selector */}
            <div
              className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center",
                isSelected && "bg-primary border-primary",
              )}
            >
              {isSelected && <Check className="h-3 w-3 text-white" />}
            </div>

            <span className="flex-1 text-sm">{addr.address}</span>

            {/* Default */}
            <Button
              size="icon"
              variant="ghost"
              disabled={addr._optimistic}
              onClick={(e) => {
                e.stopPropagation();
                setDefault.mutate({
                  customerId,
                  addressId: addr.id,
                });
              }}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  addr.is_default
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground",
                )}
              />
            </Button>

            {/* Delete */}
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                deleteAddress.mutate(addr.id);
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
