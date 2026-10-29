/*
 * Celular com código do país. Brasil (+55) fica guardado como antes, só os números com DDD
 * ("11912570058"); outros países ficam como "+351912345678".
 */

export const COUNTRIES = [
  { iso: "BR", ddi: "55", flag: "🇧🇷", name: "Brasil" },
  { iso: "PT", ddi: "351", flag: "🇵🇹", name: "Portugal" },
  { iso: "US", ddi: "1", flag: "🇺🇸", name: "Estados Unidos / Canadá" },
  { iso: "AR", ddi: "54", flag: "🇦🇷", name: "Argentina" },
  { iso: "UY", ddi: "598", flag: "🇺🇾", name: "Uruguai" },
  { iso: "PY", ddi: "595", flag: "🇵🇾", name: "Paraguai" },
  { iso: "CL", ddi: "56", flag: "🇨🇱", name: "Chile" },
  { iso: "BO", ddi: "591", flag: "🇧🇴", name: "Bolívia" },
  { iso: "PE", ddi: "51", flag: "🇵🇪", name: "Peru" },
  { iso: "CO", ddi: "57", flag: "🇨🇴", name: "Colômbia" },
  { iso: "VE", ddi: "58", flag: "🇻🇪", name: "Venezuela" },
  { iso: "MX", ddi: "52", flag: "🇲🇽", name: "México" },
  { iso: "ES", ddi: "34", flag: "🇪🇸", name: "Espanha" },
  { iso: "IT", ddi: "39", flag: "🇮🇹", name: "Itália" },
  { iso: "FR", ddi: "33", flag: "🇫🇷", name: "França" },
  { iso: "DE", ddi: "49", flag: "🇩🇪", name: "Alemanha" },
  { iso: "GB", ddi: "44", flag: "🇬🇧", name: "Reino Unido" },
  { iso: "IE", ddi: "353", flag: "🇮🇪", name: "Irlanda" },
  { iso: "NL", ddi: "31", flag: "🇳🇱", name: "Holanda" },
  { iso: "CH", ddi: "41", flag: "🇨🇭", name: "Suíça" },
  { iso: "JP", ddi: "81", flag: "🇯🇵", name: "Japão" },
  { iso: "AU", ddi: "61", flag: "🇦🇺", name: "Austrália" },
  { iso: "AO", ddi: "244", flag: "🇦🇴", name: "Angola" },
  { iso: "MZ", ddi: "258", flag: "🇲🇿", name: "Moçambique" },
] as const;

export type Country = (typeof COUNTRIES)[number];
const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.ddi.length - a.ddi.length);

/** Separa o que está guardado em país + número local. */
export function splitPhone(v: string | null | undefined): { iso: Country["iso"]; national: string } {
  const s = (v ?? "").trim();
  if (!s.startsWith("+")) return { iso: "BR", national: s.replace(/\D/g, "") };
  const d = s.replace(/\D/g, "");
  const c = BY_LENGTH.find((x) => d.startsWith(x.ddi));
  return c ? { iso: c.iso, national: d.slice(c.ddi.length) } : { iso: "BR", national: d };
}

/** Junta país + número no formato guardado. */
export function joinPhone(iso: string, national: string) {
  const d = national.replace(/\D/g, "");
  const c = COUNTRIES.find((x) => x.iso === iso) ?? COUNTRIES[0];
  if (!d) return "";
  return c.iso === "BR" ? d : `+${c.ddi}${d}`;
}

/** O que chegou do formulário ("(11) 9...", "+351 9...") no formato guardado. */
export function normalizePhone(raw: string) {
  const s = raw.trim();
  const d = s.replace(/\D/g, "");
  if (!s.startsWith("+")) return d;
  return d.startsWith("55") ? d.slice(2) : `+${d}`;
}

/** Brasil: DDD + número (10 ou 11 dígitos). Fora: 6 a 14 dígitos depois do código do país. */
export function phoneValid(v: string) {
  if (!v.startsWith("+")) return /^[1-9]\d{9,10}$/.test(v);
  const { iso, national } = splitPhone(v);
  return iso !== "BR" && /^\d{6,14}$/.test(national);
}

/** Para mostrar: "(11) 91257-0058" ou "+351 912345678". */
export function formatPhone(v: string | null | undefined) {
  if (!v) return "";
  const { iso, national } = splitPhone(v);
  if (iso === "BR") return maskBr(national);
  return `+${COUNTRIES.find((c) => c.iso === iso)!.ddi} ${national}`;
}

export function maskBr(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Link do WhatsApp (wa.me) para o número guardado. */
export function waLink(v: string) {
  const d = v.replace(/\D/g, "");
  return `https://wa.me/${v.startsWith("+") ? d : `55${d}`}`;
}
