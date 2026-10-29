import "server-only";

/** O vendedor recebe o valor anunciado menos esta taxa (a do comprador é a taxa de serviço normal). */
export const RESALE_SELLER_FEE = 0.05;
export const sellerNet = (priceCents: number) => Math.round(priceCents * (1 - RESALE_SELLER_FEE));

/** Valor de face do ingresso (meia = metade) e o máximo permitido na revenda. */
export function resaleCap(typePriceCents: number, halfPrice: boolean, maxPct: number) {
  const faceCents = halfPrice ? Math.round(typePriceCents / 2) : typePriceCents;
  return { faceCents, maxCents: Math.floor((faceCents * maxPct) / 100) };
}
