import "server-only";
import { timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { acceptedKeys, currentKey, hmacWith, type Key } from "@/lib/signing-secret";

/**
 * Payload assinado do QR: ONDE|código|assinatura (HMAC do segredo do ingresso). Fica fora dos arquivos
 * "use server": lá toda função exportada vira um endpoint público, e isto é um assinador.
 */
const payloadWith = (k: Key, code: string, secret: string) => `ONDE|${code}|${hmacWith(k, `${code}:${secret}`).slice(0, 16)}`;

export async function qrPayload(code: string, secret: string) {
  return payloadWith(currentKey("qr"), code, secret);
}

/** O QR lido é deste ingresso? Aceita a chave atual e as anteriores (QR já enviado continua valendo, SEC-200). */
export function qrPayloadMatches(code: string, secret: string, raw: string) {
  const got = Buffer.from(raw);
  return acceptedKeys("qr").some((k) => {
    const want = Buffer.from(payloadWith(k, code, secret));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

/** SVG (string) do QR code assinado de um ingresso, sem margem, para injetar no container do design. */
export async function ticketQrSvg(code: string, secret: string) {
  const payload = await qrPayload(code, secret);
  return QRCode.toString(payload, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffff00" } });
}
