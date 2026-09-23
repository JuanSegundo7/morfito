import { renderTemplate } from "@/lib/utils/renderTemplate";
import { buildOrderMessageVars, type OrderForMessage } from "@/lib/utils/formatOrderWhatsapp";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";
import type { AppSettings } from "@/lib/types";

export function formatOrderForDelivery(
  order: OrderForMessage,
  settings: AppSettings,
  businessName: string,
): string {
  const vars = buildOrderMessageVars(order, settings, businessName);
  const template = settings.delivery_template?.trim()
    ? settings.delivery_template
    : DEFAULT_APP_SETTINGS.delivery_template;
  return renderTemplate(template, vars);
}
