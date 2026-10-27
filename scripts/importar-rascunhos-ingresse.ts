/**
 * Cria como RASCUNHO (só o produtor vê, sem venda) 9 eventos montados a partir de informações
 * públicas (notícias e agendas). Preços, imagens e lotes ficam para o produtor completar.
 * Uso: tsx --env-file=<arquivo> scripts/importar-rascunhos-ingresse.ts <e-mail ou id do produtor>
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { emptyDraft, type Draft, type DraftArtist } from "../src/lib/criar/model";
import { saveEventAs } from "../src/lib/criar/save";

type Ev = { title: string; cat: string; date: string; doors: string; time: string; venue: string; city: string; desc: string; lineup: [string, string][] };

const EVENTS: Ev[] = [
  {
    title: "Mata São Paulo: Jan Blomqvist & Tripolism", cat: "Festa", date: "2026-10-30", doors: "", time: "22:00",
    venue: "Mata São Paulo", city: "São Paulo – SP",
    desc: "Jan Blomqvist traz ao Mata São Paulo o live act que mistura voz, sintetizadores e techno melódico, numa noite dividida com Tripolism.",
    lineup: [["Jan Blomqvist", "Headliner"], ["Tripolism", "Convidado"]],
  },
  {
    title: "Love Again 2026 · 10 anos", cat: "Festa", date: "2026-11-01", doors: "18:00", time: "18:00",
    venue: "Local a confirmar", city: "Teresina – PI",
    desc: "A Love Again comemora 10 anos em Teresina na maior edição da sua história, com Vintage Culture à frente do line-up.",
    lineup: [["Vintage Culture", "Headliner"], ["Ashibah", "Convidado"], ["Illusionize", "Convidado"], ["Kevin Brauer", "Convidado"]],
  },
  {
    title: "Solomun Curitiba 2026", cat: "Festival", date: "2026-10-31", doors: "", time: "14:00",
    venue: "Pedreira Paulo Leminski", city: "Curitiba – PR",
    desc: "Solomun e Vintage Culture dividem o palco da Pedreira Paulo Leminski numa edição especial de Halloween, da tarde até a noite.",
    lineup: [["Solomun", "Headliner"], ["Vintage Culture", "Headliner"]],
  },
  {
    title: "Solomun São Paulo 2026", cat: "Festival", date: "2026-11-01", doors: "", time: "14:00",
    venue: "Parque Villa-Lobos", city: "São Paulo – SP",
    desc: "Solomun volta a São Paulo para um domingo ao ar livre no Parque Villa-Lobos, a partir das 14h.",
    lineup: [["Solomun", "Headliner"]],
  },
  {
    title: "Laroc Club apresenta Mathame", cat: "Festa", date: "2026-11-07", doors: "", time: "17:00",
    venue: "Laroc Club", city: "Valinhos – SP",
    desc: "O duo italiano Mathame, dos irmãos Amedeo e Matteo Giovanelli, faz sua primeira apresentação no Laroc Club, com o techno melódico de estética cinematográfica que marcou o projeto.",
    lineup: [["Mathame", "Headliner"]],
  },
  {
    title: "Beltools: Beltran & Ben Sterling", cat: "Festa", date: "2026-11-01", doors: "", time: "",
    venue: "Surreal Park", city: "Camboriú – SC",
    desc: "A Beltools, label de Beltran, chega ao Surreal Park com Beltran e Ben Sterling na cabine.",
    lineup: [["Beltran", "Headliner"], ["Ben Sterling", "Headliner"]],
  },
  {
    title: "Laroc apresenta Boris Brejcha", cat: "Festa", date: "2026-11-13", doors: "", time: "21:00",
    venue: "Laroc Club", city: "Valinhos – SP",
    desc: "Boris Brejcha, criador do high-tech minimal, se apresenta no Laroc Club.",
    lineup: [["Boris Brejcha", "Headliner"]],
  },
  {
    title: "Laroc Guarujá apresenta Innellea & Denis Sulta", cat: "Festa", date: "2026-11-20", doors: "16:00", time: "16:00",
    venue: "Laroc Guarujá", city: "Guarujá – SP",
    desc: "O alemão Innellea e o escocês Denis Sulta se encontram no Laroc Guarujá, com Departamento, JØRD e Adria completando a noite.",
    lineup: [["Innellea", "Headliner"], ["Denis Sulta", "Headliner"], ["Departamento", "Convidado"], ["JØRD", "Convidado"], ["Adria", "Convidado"]],
  },
  {
    title: "Hernan Cattaneo no Surreal Park", cat: "Festa", date: "2026-11-20", doors: "", time: "",
    venue: "Surreal Park", city: "Camboriú – SC",
    desc: "Hernan Cattaneo, referência do progressive house, comanda uma noite no Surreal Park.",
    lineup: [["Hernan Cattaneo", "Headliner"]],
  },
];

async function main() {
  const who = process.argv[2];
  if (!who) throw new Error("Informe o e-mail (ou o id) do produtor.");
  const user = who.includes("@")
    ? (await db.execute(sql`select id, name, email from neon_auth."user" where lower(email) = lower(${who}) limit 1`)).rows[0] as { id: string; name: string | null; email: string | null } | undefined
    : { id: who, name: null, email: null };
  if (!user) throw new Error(`Usuário ${who} não encontrado.`);

  for (const ev of EVENTS) {
    const lineup: DraftArtist[] = ev.lineup.map(([name, role], i) => ({ id: `a${i + 1}`, name, role, time: "", end: "", days: null }));
    const draft: Draft = {
      ...emptyDraft(),
      mode: "unica", tmode: "simples",
      title: ev.title, cat: ev.cat, age: "18+", desc: ev.desc, lineup,
      venue: { name: ev.venue, city: ev.city },
      sessions: [{ id: "s1", date: ev.date, doors: ev.doors, time: ev.time, cap: "", venue: ev.venue, city: ev.city }],
      // preço e quantidade em branco: o produtor completa com os lotes reais
      sectors: [{ id: "k1", name: "Ingressos", color: "#D3F55B", open: true, types: [{ id: "t1", kind: "inteira", name: "Inteira", price: "", qty: "", desc: "" }] }],
      autoMeia: true, vis: "rascunho",
    };
    // roda de novo sem duplicar: atualiza o rascunho com o mesmo título do mesmo produtor
    const prev = await db.query.events.findFirst({ where: and(eq(schema.events.title, ev.title), eq(schema.events.createdByUserId, user.id)), columns: { id: true, draft: true } });
    const dbMap = (prev?.draft as { dbMap?: { sessions: Record<string, string>; types: Record<string, string> } } | null)?.dbMap ?? { sessions: {}, types: {} };
    const r = await saveEventAs(user, { draft, eventId: prev?.id ?? null, dbMap });
    console.log(r.ok ? `ok  ${ev.title} → /criar-evento?editar=${r.eventId} (${r.status})` : `erro ${ev.title}: ${r.error}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
