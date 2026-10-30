import "server-only";
import { createHmac } from "node:crypto";
import QRCode from "qrcode";
import { signingSecret } from "@/lib/signing-secret";

/**
 * Payload assinado do QR: ONDE|código|assinatura (HMAC do segredo do ingresso). Fica fora dos arquivos
 * "use server": lá toda função exportada vira um endpoint público, e isto é um assinador.
 */
export async function qrPayload(code: string, secret: string) {
  const sig = createHmac("sha256", signingSecret()).update(`${code}:${secret}`).digest("base64url").slice(0, 16);
  return `ONDE|${code}|${sig}`;
}

/** SVG (string) do QR code assinado de um ingresso, sem margem, para injetar no container do design. */
export async function ticketQrSvg(code: string, secret: string) {
  const payload = await qrPayload(code, secret);
  return QRCode.toString(payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffff00" } });
}
