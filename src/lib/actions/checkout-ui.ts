"use server";

import { redirect } from "next/navigation";
import { cancelOrder } from "@/lib/actions/checkout";

/** Cancela o pedido pendente (form action) e volta para a página do evento. */
export async function cancelOrderForm(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const eventSlug = String(formData.get("eventSlug") ?? "");
  if (orderId) await cancelOrder(orderId);
  redirect(eventSlug ? `/eventos/${eventSlug}` : "/explorar");
}
