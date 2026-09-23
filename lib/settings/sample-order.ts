// Fixture fijo (no el último pedido real) usado únicamente por el preview
// en vivo de /configuracion (Fase 2). Un pedido real casi nunca ejercita
// todas las ramas condicionales de buildOrderMessageVars
// (formatOrderWhatsapp.ts) a la vez — este SAMPLE_ORDER sí, para que el
// usuario vea cómo se ve cada sección de su plantilla mientras la edita.
//
// A diferencia del fixture equivalente en jebbs-dashboard, ESTE no incluye
// `extra_id`/`order_item_extras` en ningún item: esos son campos del modelo
// de jebbs, no de morfito. El order_items real de morfito (ver
// lib/hooks/orders/use-orders.ts's select: id, burger_name, quantity,
// unit_price, subtotal, customizations, product_id, kind,
// order_item_modifiers) nunca los popula — son restos de un modelo pre-
// genericización que buildOrderMessageVars todavía lee sin haberse migrado
// (decisión explícita, fuera de alcance de este port — ver el comentario
// de OrderForMessage en formatOrderWhatsapp.ts). Consecuencia real y
// verificada, no hipotética: la rama "SIDE" de ese archivo nunca dispara
// con datos reales, así que el item "kind: addon" de abajo (Papas Grandes)
// se ve renderizado por la rama BURGER/COMBO, sin ninguna línea de detalle
// — así es como se ve HOY un side en un pedido real, warts and all.
//
// El JSON de `customizations` de los items 1 y 2 SÍ es real: es exactamente
// lo que components/order-wizard/services/order-data-transformer.ts's
// transformBurgersToOrderItems / transformCombosToOrderItems escriben hoy
// (meatCount/friesQuantity/removedIngredients/extras para un item simple;
// un array de slots {slotId, slotType, burgers, selectedExtras} para un
// combo) — moldes de burgerVertical, el vertical de fallback (ver
// components/providers/vertical-provider.tsx), no un producto específico.
import type { OrderForMessage } from "@/lib/utils/formatOrderWhatsapp";

export const SAMPLE_ORDER: OrderForMessage = {
  order_number: 1042,
  // Fecha fija, no new Date(): este archivo es un fixture DETERMINISTA a
  // propósito (ver comentario de arriba) -- new Date() era la única parte
  // que no lo era, y al evaluarse una vez en el server (SSR) y otra vez en
  // el cliente (hidratación), en momentos distintos, produciría un
  // "Hydration failed" real cada vez que se abra /configuracion.
  created_at: "2024-06-15T15:00:00.000Z",
  customer_name: "Juan Pérez",
  customer: {
    phone: "+54 9 11 1234-5678",
    customer_addresses: [
      {
        id: "addr-1",
        address: "Av. Siempreviva 742",
        notes: "Portón verde, tocar timbre 2 veces",
      },
    ],
  },
  customer_address_id: "addr-1",
  delivery_type: "delivery",
  delivery_fee: 2000,
  payment_method: "transfer",
  delivery_time: "15:00",
  discount_type: "percentage",
  discount_value: 10,
  discount_amount: 1750,
  commission_amount: 400,
  price_adjustment: -200,
  total_amount: 17950,
  notes: "Timbre roto, tocar bocina",
  order_items: [
    // Item simple: sin papas (con descuento), ingredientes removidos y un
    // extra vía customData.extras — moldeado exactamente como
    // transformBurgersToOrderItems lo escribe hoy.
    {
      quantity: 1,
      burger_name: "Plato Principal",
      unit_price: 6000,
      subtotal: 5500, // unitPrice*quantity + friesAdjustment (6000 - 500)
      customizations: JSON.stringify({
        meatCount: 2,
        isVeggie: false,
        friesQuantity: 0,
        friesAdjustment: -500,
        removedIngredients: ["Cebolla", "Pepino"],
        extras: [{ id: "extra-1", name: "Extra Queso", quantity: 1, price: 800 }],
      }),
    },
    // Combo: customizations es un ARRAY de slots (isCombo se detecta con
    // Array.isArray) — un slot con un item + un slot de bebida.
    {
      quantity: 1,
      burger_name: "Combo Doble",
      unit_price: 9000,
      subtotal: 9000,
      customizations: JSON.stringify([
        {
          slotId: "slot-1",
          slotType: "burger",
          burgers: [
            {
              burgerId: "p-1",
              name: "Plato Bacon",
              meatCount: 2,
              isVeggie: false,
              friesQuantity: 1,
              friesAdjustment: 0,
              quantity: 1,
              removedIngredients: ["Tomate"],
              extras: [{ id: "extra-2", name: "Bacon extra", quantity: 1, price: 600 }],
            },
          ],
          selectedExtras: [],
        },
        {
          slotId: "slot-2",
          slotType: "drink",
          burgers: [],
          selectedExtras: [{ id: "extra-3", name: "Gaseosa", price: 0 }],
        },
      ]),
    },
    // Side/addon suelto (kind: "addon" en la fila real) — ver el comentario
    // de arriba sobre por qué NO lleva extra_id/order_item_extras y por qué
    // eso importa: renderiza sin ninguna línea de detalle, igual que hoy.
    {
      quantity: 2,
      burger_name: "Papas Grandes",
      unit_price: 1500,
      subtotal: 3000,
      customizations: null,
    },
  ],
};
