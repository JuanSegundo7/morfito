"use client";

import { Order } from "@/lib/types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OrderCard } from "./order-card";
import { OrderCardMobile } from "./order-card-mobile";
export function SortableOrderCard({
  order,
  onViewDetails,
  onEditOrder, // 🆕
  onChangeStatus,
  onMoveBack,
}: {
  order: Order;
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void; // 🆕
  onChangeStatus?: (order: Order) => void;
  onMoveBack?: (order: Order) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    // dnd-kit: la transicion es para los hermanos DESPLAZADOS deslizando a
    // su nuevo lugar. El item bajo el puntero debe trackear 1:1, sin
    // interpolar -- estaba invertido (el arrastrado animaba 200ms y los
    // hermanos saltaban instantaneo).
    transition: isDragging ? undefined : transition,
  };

  return (
    <>
      {/* 📱 MOBILE (sin drag) */}
      <div className="lg:hidden">
        <OrderCardMobile
          order={order}
          onViewDetails={onViewDetails}
          onEditOrder={onEditOrder} // 🆕
          onChangeStatus={onChangeStatus}
        />
      </div>

      {/* 💻 DESKTOP (con drag) */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        // useSortable ya da role="button" tabindex="0" aria-roledescription=
        // "sortable" -- sin este ring, alguien tabulando el tablero es
        // invisible para si mismo. rounded-2xl para que el ring calce con
        // el radio real de la Card de adentro.
        className="hidden lg:block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <OrderCard
          order={order}
          onViewDetails={onViewDetails}
          isDragging={isDragging}
          visualStatus={order.status}
          onEditOrder={onEditOrder} // 🆕
          onChangeStatus={onChangeStatus}
          onMoveBack={onMoveBack}
        />
      </div>
    </>
  );
}
