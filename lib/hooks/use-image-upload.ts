"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Generalizado de un `burger-images`/"burgers/" hardcodeado a parámetros
// explícitos — settings port from jebbs-dashboard. `bucket`/`pathPrefix` NO
// tienen default a propósito: el único call site pre-existente
// (app/(dashboard)/menu/page.tsx) se actualizó para pasar
// useImageUpload("burger-images", "burgers/") explícitamente en la misma
// tanda, así que un default que "mantenga funcionando" ese call site sin
// tocarlo no hacía falta — y un default silencioso es exactamente el tipo
// de solución de "funciona por accidente" que un futuro caller para el
// bucket `branding` (logo, ver components/auth/login-form.tsx /
// components/layout/sidebar.tsx) podría heredar sin darse cuenta si alguna
// vez omite el argumento.
export function useImageUpload(bucket: string, pathPrefix: string) {
  const supabase = createClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generar nombre único para el archivo
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${pathPrefix}${fileName}`;

      // Upload a Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      // Obtener URL pública
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath);

      setUploadProgress(100);
      return publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw error;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (imageUrl: string): Promise<void> => {
    try {
      // Extraer el path del URL
      const urlParts = imageUrl.split(`${bucket}/`);
      if (urlParts.length < 2) return;

      const filePath = urlParts[1];

      const { error } = await supabase.storage.from(bucket).remove([filePath]);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting image:", error);
      // No throw - si falla el delete de imagen, no es crítico
    }
  };

  return {
    uploadImage,
    deleteImage,
    isUploading,
    uploadProgress,
  };
}
