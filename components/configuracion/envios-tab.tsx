"use client";

import { DeliveryMapImageCard } from "@/components/configuracion/delivery-map-image-card";
import { DeliveryZoneMapPreview } from "@/components/configuracion/delivery-zone-map-preview";
import { DeliveryZonesCard } from "@/components/configuracion/delivery-zones-card";
import { useDeliveryZones } from "@/lib/hooks/use-delivery-zones";

export function EnviosTab() {
  // Same react-query key as DeliveryZonesCard's own call — deduped, one fetch.
  const { data: deliveryZones } = useDeliveryZones();

  return (
    <div className="space-y-6">
      <DeliveryMapImageCard />
      <DeliveryZoneMapPreview zones={deliveryZones ?? []} />
      <DeliveryZonesCard />
    </div>
  );
}
