"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { toast } from "sonner";

// Lets the owner upload/replace/remove the map image the zone shapes are
// drawn on (app_settings.delivery_map_url, scripts/050). Deliberately NOT
// resized (unlike the logo): a map needs its detail. Bucket "branding" must
// exist (created by hand, same as for logos).
export function DeliveryMapImageCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();
  const mapUpload = useImageUpload("branding", "maps/");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("El archivo tiene que ser una imagen");
        return;
      }
      const previousUrl = settings.delivery_map_url;
      const url = await mapUpload.uploadImage(file);
      await updateSettings.mutateAsync({ delivery_map_url: url });
      if (previousUrl) await mapUpload.deleteImage(previousUrl);
    } catch {
      toast.error("No se pudo subir la imagen del mapa");
    } finally {
      e.target.value = ""; // allow re-selecting the same file
    }
  };

  const handleRemove = async () => {
    const previousUrl = settings.delivery_map_url;
    try {
      await updateSettings.mutateAsync({ delivery_map_url: null });
      if (previousUrl) await mapUpload.deleteImage(previousUrl);
    } catch {
      toast.error("No se pudo quitar la imagen del mapa");
    }
  };

  const busy = mapUpload.isUploading || updateSettings.isPending;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Imagen del mapa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-muted-foreground -mt-1">
          Subí una imagen de tu zona de reparto (una captura de mapa, por ejemplo). Sobre esa
          imagen dibujás la forma de cada zona.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
          <div className="flex min-w-[140px] items-center gap-3">
            {settings.delivery_map_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.delivery_map_url}
                alt="Mapa de zonas de envío"
                className="h-16 w-24 rounded-md border border-input object-cover"
              />
            ) : (
              <div className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-input text-caption text-muted-foreground">
                Sin imagen
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleChange}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              {settings.delivery_map_url ? "Cambiar imagen" : "Subir imagen"}
            </Button>
            {settings.delivery_map_url && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={handleRemove}
                disabled={busy}
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
