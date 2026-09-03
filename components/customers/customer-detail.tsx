"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Phone, Star, Check, X } from "lucide-react";
import { AddressFormDialog } from "@/components/customers/address-form-dialog";
import { toast } from "sonner";
import { useDeleteAddress, useSetDefaultAddress } from "../../hooks/use-addresses";
import { useCustomerAddresses, useDeleteCustomer, useUpdateCustomer } from "@/hooks/use-customer";

interface CustomerDetailProps {
  customer: Customer;
  onCustomerUpdated: (customer: Customer) => void;
  onCustomerDeleted: () => void;
}

export function CustomerDetail({
  customer,
  onCustomerUpdated,
  onCustomerDeleted,
}: CustomerDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: customer.name, phone: customer.phone ?? "" });
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null);

  const { data: addresses = [], isLoading: isLoadingAddresses } = useCustomerAddresses(customer.id);
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const deleteAddress = useDeleteAddress();
  const setDefault = useSetDefaultAddress();

  // Reset edit state when customer changes
  if (customer.name !== editData.name && !isEditing) {
    setEditData({ name: customer.name, phone: customer.phone ?? "" });
  }

  const handleSaveCustomer = async () => {
    try {
      const updated = await updateCustomer.mutateAsync({
        id: customer.id,
        name: editData.name,
        phone: editData.phone || null,
      });
      onCustomerUpdated(updated);
      setIsEditing(false);
      toast.success("Cliente actualizado");
    } catch {
      toast.error("Error al actualizar el cliente");
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      await deleteCustomer.mutateAsync(customer.id);
      onCustomerDeleted();
      toast.success("Cliente eliminado");
    } catch {
      toast.error("Error al eliminar el cliente");
    }
  };

  const handleDeleteAddress = async () => {
    if (!deleteAddressId) return;
    try {
      await deleteAddress.mutateAsync({ addressId: deleteAddressId, customerId: customer.id });
      setDeleteAddressId(null);
      toast.success("Dirección eliminada");
    } catch {
      toast.error("Error al eliminar la dirección");
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      await setDefault.mutateAsync({ addressId, customerId: customer.id });
      toast.success("Dirección predeterminada actualizada");
    } catch {
      toast.error("Error al actualizar la dirección predeterminada");
    }
  };

  const editingAddressData = editingAddress
    ? addresses.find((a) => a.id === editingAddress)
    : null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Customer card */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle>Información del cliente</CardTitle>
            <div className="flex gap-2">
              {!isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditData({ name: customer.name, phone: customer.phone ?? "" });
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteCustomerOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Nombre del cliente"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  placeholder="Ej: 221 123-456"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleSaveCustomer}
                  disabled={!editData.name.trim() || updateCustomer.isPending}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{customer.name}</p>
              {customer.phone ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Sin teléfono</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Addresses */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Direcciones</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingAddress(null);
              setAddressDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nueva dirección
          </Button>
        </div>

        {isLoadingAddresses ? (
          <p className="text-sm text-muted-foreground">Cargando direcciones...</p>
        ) : addresses.length === 0 ? (
          <Card className="bg-card">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Este cliente no tiene direcciones guardadas
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {addresses.map((address) => (
              <Card key={address.id} className="bg-card transition-all hover:scale-[1.01]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {address.label && (
                          <span className="font-medium text-sm">{address.label}</span>
                        )}
                        {address.is_default && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            Predeterminada
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{address.address}</p>
                      {address.notes && (
                        <p className="text-xs text-muted-foreground/70 italic">{address.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!address.is_default && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleSetDefault(address.id)}
                          disabled={setDefault.isPending}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingAddress(address.id);
                          setAddressDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteAddressId(address.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete customer dialog */}
      <AlertDialog open={deleteCustomerOpen} onOpenChange={setDeleteCustomerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará a <strong>{customer.name}</strong> y todas sus
              direcciones. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete address dialog */}
      <AlertDialog
        open={!!deleteAddressId}
        onOpenChange={(open) => !open && setDeleteAddressId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar dirección?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAddress}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Address form dialog */}
      <AddressFormDialog
        open={addressDialogOpen}
        onOpenChange={(open) => {
          setAddressDialogOpen(open);
          if (!open) setEditingAddress(null);
        }}
        customerId={customer.id}
        address={editingAddressData ?? undefined}
      />
    </div>
  );
}