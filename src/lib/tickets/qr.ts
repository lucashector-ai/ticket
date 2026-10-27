import "server-only";
import QRCode from "qrcode";
import { qrPayload } from "@/lib/actions/tickets";

/** SVG (string) do QR code assinado de um ingresso, sem margem, para injetar no container do design. */
export async function ticketQrSvg(code: string, secret: string) {
  const payload = await qrPayload(code, secret);
  return QRCode.toString(payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffff00" } });
}
