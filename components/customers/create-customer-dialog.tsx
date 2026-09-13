"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCreateCustomer } from "@/lib/hooks/use-customers";
import type { Customer } from "@/lib/types";
import { toast } from "sonner";

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Customer) => void;
}

const defaultAddressData = { label: "", address: "", notes: "" };

export function CreateCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCustomerDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressData, setAddressData] = useState(defaultAddressData);

  const createCustomer = useCreateCustomer();

  const handleClose = () => {
    setName("");
    setPhone("");
    setAddressData(defaultAddressData);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;

    try {
      const customer = await createCustomer.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || null,
        address: addressData.address.trim()
          ? {
              label: addressData.label.trim() || "Principal",
              address: addressData.address.trim(),
              notes: addressData.notes.trim() || null,
            }
          : undefined,
      });

      onCreated(customer);
      handleClose();
      toast.success("Cliente creado correctamente");
    } catch {
      toast.error("Error al crear el cliente");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Jeremías López"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 221 123-456"
            />
          </div>

          <Separator />

          <p className="text-overline text-muted-foreground uppercase">
            Dirección (opcional)
          </p>

          <div className="space-y-2">
            <Label>Nombre de la dirección</Label>
            <Input
              value={addressData.label}
              onChange={(e) =>
                setAddressData({ ...addressData, label: e.target.value })
              }
              placeholder="Ej: Casa, Trabajo"
            />
          </div>

          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input
              value={addressData.address}
              onChange={(e) =>
                setAddressData({ ...addressData, address: e.target.value })
              }
              placeholder="Ej: Calle 50 nro 123"
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={addressData.notes}
              onChange={(e) =>
                setAddressData({ ...addressData, notes: e.target.value })
              }
              placeholder="Ej: Timbre roto, llamar por teléfono"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createCustomer.isPending}
          >
            Crear cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}