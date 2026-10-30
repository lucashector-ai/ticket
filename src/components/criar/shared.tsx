import type { Draft } from "@/lib/criar/model";

/** Parte da prévia que pisca quando o produtor mexe no campo correspondente. */
export type PvField = "type" | "name" | "age" | "desc" | "when" | "where" | "map" | "tk" | "art" | "banner" | "sale";

/** O que cada etapa recebe para ler e alterar o formulário. */
export type Ctx = {
  d: Draft;
  set: (p: Partial<Draft>, f?: PvField) => void;
  upd: (fn: (o: Draft) => Draft, f?: PvField) => void;
  flash: (m: string) => void;
  go: (i: number) => void;
  nid: (prefix: string) => string;
};

export const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const parseIso = (iso: string) => { const p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
export const isoDate = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "R$ 1.234,50" a partir de reais */
export const brMoney = (v: number) => "R$ " + (Math.round(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortMoney = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi` : brMoney(v));

export function XIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>;
}
export function Chevron({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>;
}
export function Spark({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor" /></svg>;
}
export function UploadIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>;
}

/** Envia uma imagem para /api/midia conferindo formato e proporção antes. */
export async function uploadImage(file: File, want?: { w: number; h: number; label: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, error: "Envie JPG, PNG ou WebP." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "A imagem passa de 10 MB." };
  if (want) {
    const dim = await new Promise<{ w: number; h: number } | null>((res) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });
    if (!dim) return { ok: false, error: "Não consegui ler essa imagem." };
    const ratio = dim.w / dim.h, target = want.w / want.h;
    if (Math.abs(ratio - target) / target > 0.02) return { ok: false, error: `${want.label} precisa ter a proporção de ${want.w} × ${want.h} px (pode ser maior, na mesma proporção). A sua tem ${dim.w} × ${dim.h}: recorte nessa proporção e envie de novo.` };
    if (dim.w < want.w * 0.6) return { ok: false, error: `${want.label}: imagem pequena demais (${dim.w} × ${dim.h}). Use ${want.w} × ${want.h} px.` };
  }
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/midia", { method: "POST", body: fd }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!r?.ok || !j?.url) return { ok: false, error: j?.error ?? "Não foi possível enviar a imagem. Tente de novo." };
  return { ok: true, url: j.url };
}
