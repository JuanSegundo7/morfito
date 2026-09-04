"use client";

import { useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Edit, Plus, Trash2 } from "lucide-react";
import { useAddonProducts, type AddonProduct } from "@/lib/hooks/use-products";
import {
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/lib/hooks/use-products-crud";
import type { ExtraCategory } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useVertical } from "@/components/providers/vertical-provider";

const PAGE_SIZE = 12;

export default function ExtrasPage() {
  const vertical = useVertical();
  const categoryLabels = vertical.labels.variantGroupLabels;
  const { data: extras, isLoading } = useAddonProducts();
  const createExtra = useCreateProduct();
  const updateExtra = useUpdateProduct();
  const deleteExtra = useDeleteProduct();

  const [activeTab, setActiveTab] = useState<ExtraCategory | "all">("all");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<AddonProduct | null>(null);
  const [deletingExtra, setDeletingExtra] = useState<AddonProduct | null>(
    null,
  );

  const [formData, setFormData] = useState({
    name: "",
    category: "extra" as ExtraCategory,
    price: "",
    is_available: true,
  });

  /* ---------------- FILTERS ---------------- */

  const filteredExtras = useMemo(() => {
    if (!extras) return [];
    if (activeTab === "all") return extras;
    return extras.filter((e) => e.category === activeTab);
  }, [extras, activeTab]);

  const totalPages = Math.ceil(filteredExtras.length / PAGE_SIZE);

  const paginatedExtras = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredExtras.slice(start, start + PAGE_SIZE);
  }, [filteredExtras, page]);

  /* ---------------- HANDLERS ---------------- */

  const handleOpenCreate = (category?: ExtraCategory) => {
    setEditingExtra(null);
    setFormData({
      name: "",
      category: category || "extra",
      price: "",
      is_available: true,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (extra: AddonProduct) => {
    setEditingExtra(extra);
    setFormData({
      name: extra.name,
      category: extra.category || "extra",
      price: extra.base_price.toString(),
      is_available: extra.is_available,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (editingExtra) {
      await updateExtra.mutateAsync({
        id: editingExtra.id,
        name: formData.name,
        legacy_extra_category: formData.category,
        base_price: Number(formData.price),
        is_available: formData.is_available,
      });
    } else {
      await createExtra.mutateAsync({
        name: formData.name,
        legacy_extra_category: formData.category,
        base_price: Number(formData.price),
        is_available: formData.is_available,
        description: null,
        image_url: null,
        ingredients: [],
        category_id: null,
        is_addon: true,
        default_meat_quantity: null,
        default_fries_quantity: null,
      });
    }

    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingExtra) return;
    await deleteExtra.mutateAsync({ id: deletingExtra.id, isAddon: true });
    setDeleteDialogOpen(false);
    setDeletingExtra(null);
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header
        title={vertical.labels.pages.extras.title}
        subtitle={vertical.labels.pages.extras.subtitle}
      />

      {/* FILTER BAR */}
      <div className="sticky bg-background top-0 z-10 py-3">
        <div className="flex items-center justify-between gap-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as ExtraCategory | "all");
              setPage(1);
            }}
          >
            <TabsList className="rounded-full p-1">
              <TabsTrigger value="all" className="rounded-full px-4 text-subheadline">
                Todos
              </TabsTrigger>
              <TabsTrigger value="extra" className="rounded-full px-4 text-subheadline">
                {categoryLabels.extra}
              </TabsTrigger>
              <TabsTrigger value="drink" className="rounded-full px-4 text-subheadline">
                {categoryLabels.drink}
              </TabsTrigger>
              <TabsTrigger value="fries" className="rounded-full px-4 text-subheadline">
                {categoryLabels.fries}
              </TabsTrigger>
              <TabsTrigger value="sides" className="rounded-full px-4 text-subheadline">
                {categoryLabels.sides}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={() => handleOpenCreate()}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-auto p-6 rounded-md ios-glass bg-card">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : paginatedExtras.length ? (
          <div className="space-y-2">
            {paginatedExtras.map((extra) => (
              <Card
                key={extra.id}
                className={cn(
                  "group transition-all hover:scale-[1.01] bg-card",
                  !extra.is_available && "opacity-50",
                )}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium leading-none">{extra.name}</p>
                    <span className="text-caption text-muted-foreground">
                      {extra.category ? categoryLabels[extra.category] : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-semibold">
                      {formatCurrency(extra.base_price)}
                    </span>

                    <Badge variant="outline" className="text-caption bg-card">
                      {extra.is_available ? "Activo" : "Inactivo"}
                    </Badge>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(extra)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          setDeletingExtra(extra);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">
              No hay items en esta categoría
            </p>
            <Button className="mt-4" onClick={() => handleOpenCreate()}>
              Crear primer item
            </Button>
          </div>
        )}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 ios-glass rounded-full px-4 py-2 flex items-center gap-2 bg-card">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </Button>
          <span className="text-subheadline">
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
      )}

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingExtra ? "Editar item" : "Nuevo item"}
            </DialogTitle>
            <DialogDescription>
              {editingExtra
                ? "Modificá los datos del item"
                : "Completá los datos para crear un nuevo item"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={formData.category}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    category: v as ExtraCategory,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="extra">{categoryLabels.extra}</SelectItem>
                  <SelectItem value="drink">{categoryLabels.drink}</SelectItem>
                  <SelectItem value="fries">{categoryLabels.fries}</SelectItem>
                  <SelectItem value="sides">{categoryLabels.sides}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Precio</Label>
              <Input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_available}
                onCheckedChange={(v) =>
                  setFormData({ ...formData, is_available: v })
                }
              />
              <Label>Disponible</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!formData.name || !formData.price}
              onClick={handleSubmit}
            >
              {editingExtra ? "Guardar cambios" : "Crear item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar item</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{deletingExtra?.name}"? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
