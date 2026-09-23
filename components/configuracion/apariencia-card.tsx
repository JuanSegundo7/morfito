"use client";

import { useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { resizeImageToPng } from "@/lib/utils/resizeImageToPng";
import { toast } from "sonner";

// Settings port from jebbs-dashboard's apariencia-card.tsx. Bucket "branding"
// / prefix "logos/" per Phase 1's use-image-upload.ts generalization — the
// bucket needs to be created by hand in Supabase (see Phase 1 notes); until
// then, uploads here fail at runtime, which is expected and not a bug in
// this file. Fallback image is morfito's own "/placeholder-logo.png"
// (same one components/layout/sidebar.tsx and components/auth/login-form.tsx
// already use), not jebbs' tenant-specific "/jebbs.jpg".
export function AparienciaCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();
  const logoUpload = useImageUpload("branding", "logos/");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resizedBlob = await resizeImageToPng(file);
      const resizedFile = new File([resizedBlob], "logo.png", { type: "image/png" });
      if (settings.logo_url) {
        await logoUpload.deleteImage(settings.logo_url);
      }
      const url = await logoUpload.uploadImage(resizedFile);
      updateSettings.mutate({ logo_url: url });
    } catch (error) {
      toast.error("No se pudo subir el logo");
    } finally {
      e.target.value = ""; // permite re-seleccionar el mismo archivo
    }
  };

  const handleRemoveLogo = async () => {
    if (settings.logo_url) {
      await logoUpload.deleteImage(settings.logo_url);
    }
    updateSettings.mutate({ logo_url: null });
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Apariencia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div className="flex items-center gap-3">
            <Image
              src={settings.logo_url ?? "/placeholder-logo.png"}
              alt="Logo"
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg object-cover border border-input"
            />
            <div>
              <p className="font-medium">Logo del negocio</p>
              <p className="text-caption text-muted-foreground">Aparece en el sidebar y el login</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={logoUpload.isUploading}>
              {logoUpload.isUploading ? "Subiendo..." : "Cambiar imagen"}
            </Button>
            {settings.logo_url && (
              <Button variant="ghost" size="sm" onClick={handleRemoveLogo}>
                Quitar
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Color principal (modo claro)</p>
            <p className="text-caption text-muted-foreground">Botones, links y acentos cuando la app está en modo claro</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.primary_color_light}
              onChange={(e) => updateSettings.mutate({ primary_color_light: e.target.value })}
              className="h-9 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
              aria-label="Color principal, modo claro"
            />
            <Input
              type="text"
              value={settings.primary_color_light}
              onChange={(e) => {
                const value = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                  updateSettings.mutate({ primary_color_light: value });
                }
              }}
              className="w-24 font-mono text-caption"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Color principal (modo oscuro)</p>
            <p className="text-caption text-muted-foreground">Botones, links y acentos cuando la app está en modo oscuro</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.primary_color_dark}
              onChange={(e) => updateSettings.mutate({ primary_color_dark: e.target.value })}
              className="h-9 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
              aria-label="Color principal, modo oscuro"
            />
            <Input
              type="text"
              value={settings.primary_color_dark}
              onChange={(e) => {
                const value = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                  updateSettings.mutate({ primary_color_dark: value });
                }
              }}
              className="w-24 font-mono text-caption"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
