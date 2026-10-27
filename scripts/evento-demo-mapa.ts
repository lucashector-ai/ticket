/**
 * Cria (ou atualiza) o evento de demonstração "Aurora Ao Vivo": 3 datas, setores com mapa 3D, cupons.
 * Fica na conta do produtor indicado, que pode editar depois em /meus-eventos.
 * Uso: tsx --env-file=<arquivo> scripts/evento-demo-mapa.ts <e-mail ou id do produtor>
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { emptyDraft, type Draft } from "../src/lib/criar/model";
import { templatePlan } from "../src/lib/criar/plan";
import { saveEventAs } from "../src/lib/criar/save";

const T = (id: string, kind: "inteira" | "meia" | "social" | "outro", name: string, price: string, qty: string, desc = "") => ({ id, kind, name, price, qty, desc });

async function main() {
  const who = process.argv[2];
  if (!who) throw new Error("Informe o e-mail (ou o id) do produtor.");
  let user: { id: string; name: string | null; email: string | null } | undefined;
  if (who.includes("@")) {
    const rows = await db.execute(sql`select id, name, email from neon_auth."user" where lower(email) = lower(${who}) limit 1`);
    user = rows.rows[0] as typeof user;
  } else {
    const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, who) });
    user = { id: who, name: p?.name ?? null, email: p?.email ?? null };
  }
  if (!user) throw new Error(`Usuário ${who} não encontrado.`);

  const draft: Draft = {
    ...emptyDraft(),
    mode: "temporada", tmode: "mapa",
    title: "Aurora Ao Vivo", cat: "Show", age: "16+",
    desc: "A banda Aurora volta a São Paulo com o show completo do novo álbum: três noites seguidas, palco 360° e repertório diferente a cada data.\n\nEscolha o setor no mapa do local: a Pista Premium fica colada no palco e os camarotes ficam elevados nas laterais, com open bar.",
    lineup: [
      { id: "a1", name: "Aurora", role: "Headliner", time: "22:00", end: "23:59", days: null },
      { id: "a2", name: "Lia Moreno", role: "Convidado", time: "20:30", end: "21:30", days: null },
      { id: "a3", name: "DJ Litoral", role: "Abertura", time: "19:00", end: "20:15", days: ["s1", "s3"] },
    ],
    media: { poster: "/midia/eventos/demo/aurora-cartaz.jpg", banner: "/midia/eventos/demo/aurora-banner.jpg" },
    coupons: [
      { id: "c1", code: "AURORA10", kind: "pct", value: "10", limit: "500", until: "15/11/2026", scope: "all" },
      { id: "c2", code: "PARCEIRO30", kind: "brl", value: "30", limit: "50", until: "", scope: "k2" },
    ],
    venue: { name: "Arena Norte", city: "São Paulo – SP" },
    sessions: [
      { id: "s1", date: "2026-11-19", doors: "19:00", time: "21:00", cap: "5360", venue: "Arena Norte", city: "São Paulo – SP" },
      { id: "s2", date: "2026-11-20", doors: "19:00", time: "21:00", cap: "5360", venue: "Arena Norte", city: "São Paulo – SP" },
      { id: "s3", date: "2026-11-21", doors: "18:00", time: "20:00", cap: "5360", venue: "Arena Norte", city: "São Paulo – SP" },
    ],
    autoMeia: false, fee: true,
    sectors: [
      { id: "k1", name: "Pista", color: "#7DA2FF", open: true, types: [
        T("t1", "meia", "Meia-entrada", "275", "1400", "Estudantes, PcD, jovens de baixa renda e maiores de 60. Apresente documento com foto na entrada."),
        T("t2", "social", "Meia-social", "330", "600", "Parte do valor é doada ao Hospital Pequeno Príncipe. Leve 1 kg de alimento não perecível."),
        T("t3", "inteira", "Inteira", "550", "1600")] },
      { id: "k2", name: "Pista Premium", color: "#D3F55B", open: false, types: [
        T("t5", "meia", "Meia-entrada", "450", "400", "Mesmas regras da meia da Pista."),
        T("t7", "inteira", "Inteira", "900", "800", "Área em frente ao palco, com bar exclusivo.")] },
      { id: "k3", name: "Camarote Open Bar", color: "#FF8AD8", open: false, types: [
        T("t8", "inteira", "Inteira", "1100", "420", "Open bar de cerveja, água e refrigerante. Banheiros exclusivos."),
        T("t9", "meia", "Meia-entrada", "550", "140")] },
    ],
    map: "done", prompt: "Arena de uns 40 × 60 m. Palco no fundo, Pista Premium logo na frente, camarotes elevados nas duas laterais, bares no fundo e banheiros perto da entrada.",
    plan: { ...templatePlan(["k2", "k1", "k3"]), notes: [] },
    vis: "publico", saleStart: "", refund: "Até 7 dias após a compra, com 48h de antecedência",
  };

  // roda de novo sem duplicar: atualiza o evento que já existe
  const prev = await db.query.events.findFirst({ where: eq(schema.events.title, draft.title), columns: { id: true, createdByUserId: true, draft: true } });
  const mine = prev && prev.createdByUserId === user.id ? prev : null;
  const dbMap = (mine?.draft as { dbMap?: { sessions: Record<string, string>; types: Record<string, string> } } | null)?.dbMap ?? { sessions: {}, types: {} };
  const r = await saveEventAs(user, { draft, eventId: mine?.id ?? null, dbMap });
  console.log(r.ok ? `ok: /eventos/${r.slug} (${r.status})` : `erro: ${r.error}`);
  if (!r.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
