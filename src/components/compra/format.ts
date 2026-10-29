export const onlyDigits = (v: string) => v.replace(/\D/g, "");
export const fmtCpf = (v: string) =>
  onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
export const fmtCard = (v: string) => onlyDigits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
export const fmtExp = (v: string) => {
  const x = onlyDigits(v).slice(0, 4);
  return x.length > 2 ? `${x.slice(0, 2)}/${x.slice(2)}` : x;
};
export const cardBrand = (v: string) => {
  const x = onlyDigits(v);
  if (/^(4011|4312|4389|5041|5067|6277|6362|6363|650|6516|6550)/.test(x)) return "Elo";
  if (/^4/.test(x)) return "Visa";
  if (/^5[1-5]|^2[2-7]/.test(x)) return "Mastercard";
  if (/^3[47]/.test(x)) return "Amex";
  return "Cartão";
};
export const mmss = (v: number) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
export const isFullName = (v: string) => v.trim().split(/\s+/).filter(Boolean).length >= 2;
export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
/** Validade MM/AA no futuro. */
export const expOk = (v: string) => {
  const x = onlyDigits(v);
  if (x.length !== 4) return false;
  const mm = Number(x.slice(0, 2)), yy = 2000 + Number(x.slice(2));
  if (mm < 1 || mm > 12) return false;
  const now = new Date();
  return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
};
export const fmtCep = (v: string) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
/** Nome como impresso no cartão: só letras, espaço, ponto, hífen e apóstrofo (3 a 80). */
export const printedNameOk = (v: string) => {
  const t = v.trim();
  return t.length >= 3 && t.length <= 80 && /^[\p{L}' .-]+$/u.test(t) && /\p{L}.*\p{L}/u.test(t);
};
