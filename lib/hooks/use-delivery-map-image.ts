"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-app-settings";
import { FALLBACK_MAP_WIDTH, FALLBACK_MAP_HEIGHT } from "@/lib/utils/map-coordinates";

// Resolves the tenant's map image (settings.delivery_map_url) and its natural
// dimensions. With no URL it returns the fixed grid-canvas size and
// isReady = true. `isReady` is false only while a real image is loading (or
// failed to load, in which case it stays on the fallback box with url null
// so the grid canvas still renders).
export function useDeliveryMapImage(): {
  url: string | null;
  width: number;
  height: number;
  isReady: boolean;
} {
  const { delivery_map_url } = useSettings();
  const [loaded, setLoaded] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!delivery_map_url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setLoaded({
        url: delivery_map_url,
        width: img.naturalWidth || FALLBACK_MAP_WIDTH,
        height: img.naturalHeight || FALLBACK_MAP_HEIGHT,
      });
    };
    img.onerror = () => {
      if (!cancelled) setFailedUrl(delivery_map_url);
    };
    img.src = delivery_map_url;
    return () => {
      cancelled = true;
    };
  }, [delivery_map_url]);

  if (!delivery_map_url || failedUrl === delivery_map_url) {
    return { url: null, width: FALLBACK_MAP_WIDTH, height: FALLBACK_MAP_HEIGHT, isReady: true };
  }
  if (loaded && loaded.url === delivery_map_url) {
    return { url: loaded.url, width: loaded.width, height: loaded.height, isReady: true };
  }
  return { url: null, width: FALLBACK_MAP_WIDTH, height: FALLBACK_MAP_HEIGHT, isReady: false };
}
