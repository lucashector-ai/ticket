import { randomBytes } from "node:crypto";

/**
 * Código do ingresso (TW-XXXX-XXXX), o mesmo que a portaria aceita digitado. Muda sempre que o ingresso troca
 * de dono (transferência aceita, revenda): quem tinha o ingresso conhece o código antigo, e com o código
 * antigo ele não entra mais.
 */
export function ticketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `TW-${s.slice(0, 4)}-${s.slice(4)}`;
}
