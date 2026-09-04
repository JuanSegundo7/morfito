"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Customer } from "@/lib/types";
import { useCustomerAddresses, useUpdateCustomer } from "@/lib/hooks/use-customers";
import { CustomerAddressesEditor } from "./customer-adresses-editor";
import { toast } from "sonner";
import { User, Phone, MapPin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function EditCustomerModal({
  open,
  onOpenChange,
  customer,
  onSelectAddress,
  currentAddressId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer;
  onSelectAddress?: (addressId: string) => void;
  currentAddressId?: string;
}) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [selectedAddress, setSelectedAddress] = useState<any>();

  const {
    data: addresses = [],
    isLoading,
    isFetching,
  } = useCustomerAddresses(customer.id);

  const updateCustomer = useUpdateCustomer(customer.id);

  useEffect(() => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
  }, [customer.id]);

  useEffect(() => {
    if (selectedAddress || addresses.length === 0) return;

    const current = currentAddressId
      ? addresses.find((a) => a.id === currentAddressId)
      : undefined;

    if (current) {
      setSelectedAddress(current);
      return;
    }

    const addr = addresses.find((a) => a.is_default) ?? addresses[0];
    setSelectedAddress(addr);
    onSelectAddress?.(addr.id);
  }, [addresses, selectedAddress, currentAddressId]);

  const handleSelectAddress = (addr: any) => {
    setSelectedAddress(addr);
    onSelectAddress?.(addr.id);
  };

  const isDirty =
    name.trim() !== customer.name || phone.trim() !== (customer.phone ?? "");

  const handleSave = () => {
    if (!name.trim()) return;
    updateCustomer.mutate(
      { name: name.trim(), phone: phone.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Cliente actualizado");
          onOpenChange(false);
        },
        onError: () => {
          toast.error("Error al actualizar el cliente");
        },
      },
    );
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card p-0 overflow-hidden gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-callout">Editar cliente</DialogTitle>
              <p className="text-caption text-muted-foreground mt-0.5">
                {customer.name}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto max-h-[60vh]">
          {/* Datos personales */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-overline uppercase text-muted-foreground">
                Datos personales
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-subheadline font-medium">Nombre</label>
                <div className="relative">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-background pr-8"
                    placeholder="Nombre del cliente"
                  />
                  {name.trim() !== customer.name && name.trim() && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-400 block" />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-subheadline font-medium flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Teléfono
                  <span className="text-caption text-muted-foreground font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-background pr-8"
                    placeholder="Ej: 221 123-456"
                  />
                  {phone.trim() !== (customer.phone ?? "") && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-400 block" />
                  )}
                </div>
              </div>

              {isDirty && (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-caption text-amber-700 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  Hay cambios sin guardar en los datos personales
                </div>
              )}
            </div>
          </div>

          <div className="px-6"><div className="border-t" /></div>

          {/* Direcciones */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-overline uppercase text-muted-foreground">
                Direcciones
              </span>
              <span className="ml-auto text-caption text-muted-foreground italic">
                Se guardan automáticamente
              </span>
            </div>

            <CustomerAddressesEditor
              customerId={customer.id}
              addresses={addresses}
              isLoading={isLoading || isFetching}
              selectedAddressId={selectedAddress?.id}
              onSelect={handleSelectAddress}
            />
          </div>
        </div>

        {/* Footer fijo */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-4 bg-muted/30">
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={updateCustomer.isPending}
            className="text-muted-foreground"
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSave}
            disabled={!isDirty || updateCustomer.isPending || !name.trim()}
            className="min-w-36"
          >
            {updateCustomer.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Guardando...
              </span>
            ) : isDirty ? (
              "Guardar cambios"
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sin cambios
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}