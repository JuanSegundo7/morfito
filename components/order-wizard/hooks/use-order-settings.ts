import { DeliveryType, DiscountType, PaymentMethod } from "@/lib/types";
import { useRef, useState } from "react";
import { useSettings } from "@/lib/hooks/use-app-settings";

function getDefaultDeliveryTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Settings port from jebbs-dashboard: replaces the
// "restaurant_default_delivery_fee" localStorage key (per-device, could
// silently drift between counter/phone/back office) with the app_settings
// singleton (scripts/048-app-settings.sql) — same value, same default (2000,
// see lib/settings/defaults.ts), read through Supabase instead of
// localStorage. useOrderSettings() calls useSettings() directly rather than
// taking it as a parameter — it's a hook, so composing another hook inside
// it needs no change to this hook's own call sites
// (components/order-wizard/hooks/use-order-wizard.ts keeps calling
// useOrderSettings() with no arguments).
export function useOrderSettings() {
  const appSettings = useSettings();
  // Siempre apunta a `appSettings` sin disparar un re-render -- ver el
  // comentario de `reset()` más abajo para por qué importa.
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(
    "pickup",
  );
  const [deliveryFee, setDeliveryFee] = useState(
    () => appSettings.default_delivery_fee,
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">(
    "cash",
  );
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<
    "amount" | "percentage" | "none"
  >("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState(getDefaultDeliveryTime);
  // Cost/stock/finance porting, PR2: which sales channel this order came
  // from (see lib/utils/commission.ts's getOrderSources()). Null = no
  // channel selected — never coerced to a default, matches
  // Order.source's own "never coerced" contract (lib/types/index.ts).
  const [source, setSource] = useState<string | null>(null);
  // Cost/stock/finance porting, PR3: signed flat amount adjusting the
  // order total (see orders.price_adjustment, scripts/043). Kept entirely
  // separate from discountType/discountValue — never coerced into a
  // discount field. Defaults to 0 (no-op), same as its DB column default.
  const [priceAdjustment, setPriceAdjustment] = useState(0);

  const reset = () => {
    // Lee del ref, NO del valor de `appSettings` cerrado en el render
    // inicial de este hook -- `reset()` corre cuando el drawer del wizard
    // se abre en modo creación (el drawer queda montado, solo `open`
    // cambia), mucho después del render inicial, así que para entonces la
    // query ["app-settings"] casi seguro ya resolvió. Leer el parámetro
    // cerrado acá podría congelar el default hardcodeado para siempre si el
    // wizard se abrió antes de que esa query resolviera.
    const current = appSettingsRef.current;
    setDeliveryType("delivery");
    setDeliveryFee(current.default_delivery_fee);
    setPaymentMethod("transfer");
    setDiscountType("none");
    setDiscountValue(0);
    setNotes("");
    setDeliveryTime(getDefaultDeliveryTime()); // recalcula al momento del reset
    setSource(null);
    setPriceAdjustment(0);
  };

  const loadSettings = (settings: {
    deliveryType: DeliveryType;
    deliveryFee: number;
    paymentMethod: PaymentMethod;
    discountType: DiscountType;
    discountValue: number;
    notes: string;
    deliveryTime?: string;
    source?: string | null;
    priceAdjustment?: number;
  }) => {
    setDeliveryType(settings.deliveryType);
    setDeliveryFee(settings.deliveryFee);
    setPaymentMethod(settings.paymentMethod);
    setDiscountType(settings.discountType);
    setDiscountValue(settings.discountValue);
    setNotes(settings.notes);
    setDeliveryTime(settings.deliveryTime || "");
    setSource(settings.source ?? null);
    setPriceAdjustment(settings.priceAdjustment ?? 0);
  };

  return {
    deliveryType,
    setDeliveryType,
    deliveryFee,
    setDeliveryFee,
    paymentMethod,
    setPaymentMethod,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    notes,
    setNotes,
    deliveryTime,
    setDeliveryTime,
    source,
    setSource,
    priceAdjustment,
    setPriceAdjustment,
    reset,
    loadSettings,
  };
}