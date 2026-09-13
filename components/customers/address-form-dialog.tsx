"use client";

import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCreateAddress, useUpdateAddress } from "../../hooks/use-addresses";

interface AddressData {
  id: string;
  label: string | null;
  address: string;
  notes: string | null;
  is_default: boolean;
}

interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  address?: AddressData;
}

export function AddressFormDialog({
  open,
  onOpenChange,
  customerId,
  address,
}: AddressFormDialogProps) {
  const isEditing = !!address;

  const [label, setLabel] = useState("");
  const [addressText, setAddressText] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(address?.label ?? "");
      setAddressText(address?.address ?? "");
      setNotes(address?.notes ?? "");
      setIsDefault(address?.is_default ?? false);
    }
  }, [open, address]);

  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const isPending = createAddress.isPending || updateAddress.isPending;

  const handleSubmit = async () => {
    if (!addressText.trim()) return;

    try {
      if (isEditing && address) {
        await updateAddress.mutateAsync({
          addressId: address.id,
          customerId,
          label: label.trim() || null,
          address: addressText.trim(),
          notes: notes.trim() || null,
          is_default: isDefault,
        });
        toast.success("Dirección actualizada");
      } else {
        await createAddress.mutateAsync({
          customerId,
          label: label.trim() || null,
          address: addressText.trim(),
          notes: notes.trim() || null,
          is_default: isDefault,
        });
        toast.success("Dirección creada");
      }
      onOpenChange(false);
    } catch {
      toast.error("Error al guardar la dirección");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar dirección" : "Nueva dirección"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre de la dirección</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Casa, Trabajo"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Dirección *</Label>
            <Input
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder="Ej: Calle 50 nro 123"
            />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Timbre roto, llamar por teléfono"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <Label htmlFor="is-default" className="cursor-pointer">
              Establecer como predeterminada
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!addressText.trim() || isPending}
          >
            {isEditing ? "Guardar cambios" : "Agregar dirección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}