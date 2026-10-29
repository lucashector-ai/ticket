import "server-only";
import QRCode from "qrcode";

/** Copia e cola do Pix do modo de teste (sem Stripe): fixo por pedido, então a retomada mostra o mesmo código. */
export function pixCopyPaste(orderNumber: number, totalCents: number) {
  const amount = (totalCents / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136ticketswin-pix-${orderNumber}5204000053039865406${amount}5802BR5911TICKETS WIN6009SAO PAULO62070503***6304A1F3`;
}

export async function testPix(orderNumber: number, totalCents: number) {
  const pixCode = pixCopyPaste(orderNumber, totalCents);
  return { pixCode, pixQrSvg: await QRCode.toString(pixCode, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) };
}
