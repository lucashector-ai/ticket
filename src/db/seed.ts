/* Seed de desenvolvimento: 12 eventos do design, artistas, locais, produtores e lotes.
   Rode com: pnpm db:seed  (usa DATABASE_URL do .env.local) */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");
const db = drizzle(neon(url), { schema });

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

type Ev = {
  id: string; title: string; cat: string; color: string; kinds: string[]; cats: string[];
  venue: string; neighborhood?: string; city: string; uf: string; start: string; end: string;
  range?: string; full?: string; price: number; pop: number; tagline: string; lineup: string[];
  desc: string; doors: string; age: string; addr: string; prod: string; prodBio: string; timed?: boolean;
  paragraphs?: string[]; heroOrder?: number;
};

const E: Ev[] = [
  { id: "baile", title: "Baile do Futuro", cat: "Funk", color: "#CBFF3D", kinds: ["musica", "festas"], cats: ["funk", "hiphop"], venue: "Galpão Elevado", neighborhood: "Barra Funda", city: "São Paulo", uf: "SP", start: "2026-10-31T22:00", end: "2026-11-01T06:00", price: 89, pop: 2140, tagline: "Paredão afinado e pista aberta até o sol na Barra Funda.", lineup: ["MC Luana K", "DJ Pernambuco", "Bonde 017", "Trakinas Sound System"], desc: "Funk de São Paulo pensado como futuro: paredão afinado, pista aberta até o sol e um line-up que junta quem fez a cena com quem está reinventando ela.", doors: "22h · festa até 6h", age: "18+ com documento com foto", addr: "Barra Funda · São Paulo – SP", prod: "Futuro Produções", prodBio: "Bailes e festas de funk em galpões de São Paulo, com foco em artistas da nova geração.", heroOrder: 1,
    paragraphs: [
      "O Baile do Futuro nasceu de uma pergunta simples: como seria o funk de São Paulo daqui a dez anos? A resposta virou festa. Paredão afinado por engenheiros de som, pista aberta até o sol nascer e um line-up que junta quem construiu a cena nos fluxos da zona leste com quem está reinventando o gênero nos estúdios caseiros da cidade.",
      "A edição de 2026 ocupa o Galpão Elevado, na Barra Funda, um antigo armazém ferroviário com pé-direito de doze metros transformado em pista. O sistema de som foi montado especialmente para a noite: quarenta caixas, graves que você sente no peito e um desenho acústico pensado para que a voz do MC chegue limpa em qualquer canto do galpão.",
      "MC Luana K abre a noite com o repertório que dominou as playlists este ano. Em seguida, DJ Pernambuco traz o set de beats acelerados que mistura funk mandelão, brega e eletrônico. Bonde 017 sobe ao palco no horário nobre com a apresentação completa do novo álbum, e o Trakinas Sound System fecha a pista até o amanhecer com o paredão no volume máximo.",
      "Entre um set e outro, o espaço tem intervenções visuais assinadas por artistas da periferia paulistana, projeções mapeadas nas paredes do galpão e uma área externa com food trucks, bar de drinks autorais e lounge para quem quiser respirar um pouco antes de voltar para a pista.",
      "Os portões abrem às 22h e a festa vai até as 6h. A entrada é exclusiva para maiores de 18 anos, com documento oficial com foto. Recomendamos chegar cedo: a fila costuma crescer depois da meia-noite e os primeiros a entrar ganham o acesso ao espaço de frente para o palco.",
      "O Galpão Elevado fica a cinco minutos a pé da estação Palmeiras-Barra Funda, que funciona até meia-noite. Para a volta, haverá um ponto de embarque de aplicativos sinalizado na saída lateral, com equipe de apoio orientando a dispersão a partir das 5h. O estacionamento no local é limitado e não pode ser reservado com antecedência.",
      "O espaço é acessível para pessoas com deficiência ou mobilidade reduzida, com rampa de acesso, banheiros adaptados e área reservada com visão do palco. Água gratuita estará disponível em pontos sinalizados durante toda a noite, e uma equipe de saúde fica de plantão no posto ao lado do bar principal.",
      "Não é permitida a entrada com bebidas, objetos cortantes, guarda-chuvas, bastões de selfie ou câmeras profissionais. Os ingressos são nominais e serão enviados para o seu e-mail e para o app da Onde. Na entrada, apresente o QR code junto com o documento. Dúvidas sobre meia-entrada, lotes ou reembolso podem ser enviadas direto para a produção pela página do evento.",
    ] },
  { id: "subsolo", title: "Subsolo 004", cat: "Eletrônica", color: "#3A3A3A", kinds: ["musica", "festas"], cats: ["eletronica"], venue: "Local revelado 24h antes", city: "São Paulo", uf: "SP", start: "2026-10-30T23:59", end: "2026-10-31T08:00", price: 60, pop: 1870, tagline: "Techno itinerante, sem fotos e sem camarote.", lineup: ["Vera Kassab", "Ruído Branco", "Oto b2b Nara"], desc: "Quarta edição da festa itinerante de techno. Som de alta definição, sem camarote e uma pista que só existe por uma noite.", doors: "23h59 · até 8h", age: "18+ com documento com foto", addr: "Endereço enviado por e-mail 24h antes · São Paulo – SP", prod: "Coletivo Subsolo", prodBio: "Festas itinerantes de techno em locais secretos, sem fotos e sem camarote." },
  { id: "marea", title: "Marea Festival", cat: "Festival", color: "#FF5B1F", kinds: ["musica", "festivais"], cats: ["festivais"], venue: "Praia do Santinho", city: "Florianópolis", uf: "SC", start: "2026-11-21T14:00", end: "2026-11-22T23:00", range: "21–22 Nov · 14h", full: "21 a 22 de novembro de 2026", price: 320, pop: 5210, tagline: "Dois dias de música de frente para o mar.", lineup: ["Céu Aberto", "Lia Moreno", "Coletivo Maré Alta", "Dunas Live"], desc: "Dois dias de música de frente para o mar: três palcos, 28 artistas, comida local e o pôr do sol como headliner.", doors: "13h nos dois dias", age: "Livre · menores de 16 acompanhados", addr: "Praia do Santinho · Florianópolis – SC", prod: "Maré Alta Eventos", prodBio: "Festival de música à beira-mar com palcos ao ar livre e gastronomia local.", heroOrder: 4 },
  { id: "cypher", title: "Cypher Nacional", cat: "Hip-hop", color: "#E3261B", kinds: ["musica", "arte"], cats: ["hiphop"], venue: "Viaduto Santa Tereza", neighborhood: "Centro", city: "Belo Horizonte", uf: "MG", start: "2026-11-08T18:00", end: "2026-11-08T23:00", price: 40, pop: 1320, tagline: "A final nacional de batalhas debaixo do viaduto.", lineup: ["16 MCs de 9 estados", "DJ Kalunga", "Nego Vento"], desc: "A final nacional de batalhas volta para baixo do viaduto onde tudo começou. Dezesseis MCs, um microfone e o público como júri.", doors: "17h", age: "Livre", addr: "Centro · Belo Horizonte – MG", prod: "Liga Nacional de Rima", prodBio: "Organiza batalhas de MCs e a final nacional que reúne vencedores de todo o país." },
  { id: "noite", title: "Noite Ácida", cat: "Eletrônica", color: "#FF4FD8", kinds: ["musica", "festas"], cats: ["eletronica"], venue: "Armazém 7, Cais Mauá", neighborhood: "Cais Mauá", city: "Porto Alegre", uf: "RS", start: "2026-11-06T23:00", end: "2026-11-07T07:00", price: 70, pop: 980, tagline: "Trance, hard groove e breaks na beira do Guaíba.", lineup: ["Lumi", "Hardpop", "Sítio Brasa", "Caixa Preta"], desc: "Trance, hard groove e breaks num armazém na beira do Guaíba. Luz baixa, BPM alto e nenhuma pressa de ir embora.", doors: "23h · até 7h", age: "18+ com documento com foto", addr: "Cais Mauá · Porto Alegre – RS", prod: "Ácida Records", prodBio: "Selo e festa de trance, hard groove e breaks do sul do Brasil." },
  { id: "luz", title: "Luz de Chão", cat: "Arte & Cultura", color: "#FFCB66", kinds: ["arte"], cats: ["arte"], venue: "Casa Tangente", city: "São Paulo", uf: "SP", start: "2026-10-26T12:00", end: "2026-11-30T20:00", range: "Até 30 Nov · Ter–Dom", full: "26 de outubro a 30 de novembro de 2026", price: 45, pop: 760, tagline: "Uma instalação imersiva sobre o tempo.", lineup: ["Ana Teixó", "Kenji Moura"], desc: "Uma sala escura, um feixe de luz rente ao chão e quarenta minutos para atravessar. Instalação imersiva sobre o tempo que a cidade não deixa a gente ter.", doors: "Sessões a cada 40 min, 12h—20h", age: "Livre", addr: "São Paulo – SP", prod: "Casa Tangente", prodBio: "Espaço independente de arte contemporânea e instalações imersivas.", timed: false },
  { id: "orquestra", title: "Orquestra de Rua", cat: "Experiência", color: "#F2B544", kinds: ["musica", "shows", "experiencias"], cats: ["experiencias"], venue: "Marina da Glória", neighborhood: "Glória", city: "Rio de Janeiro", uf: "RJ", start: "2026-11-14T20:00", end: "2026-11-14T23:30", price: 150, pop: 4380, tagline: "Sessenta músicos e o som do Rio de madrugada.", lineup: ["60 músicos", "Dora Saboia", "Bloco Ventania"], desc: "Sessenta músicos de rodas de samba, bandas marciais e baile charme num só palco. Um concerto que soa como o Rio às três da manhã.", doors: "18h30", age: "Livre · menores de 12 acompanhados", addr: "Glória · Rio de Janeiro – RJ", prod: "Ventania Cultural", prodBio: "Produtora de concertos que unem samba, bandas marciais e baile charme." },
  { id: "mesa", title: "Mesa Longa", cat: "Experiência", color: "#1E3A2B", kinds: ["experiencias"], cats: ["experiencias"], venue: "Rooftop Bela Vista", neighborhood: "Bela Vista", city: "São Paulo", uf: "SP", start: "2026-11-13T19:30", end: "2026-11-13T23:59", price: 480, pop: 640, tagline: "Jantar a seis mãos e DJ set ao pôr do sol.", lineup: ["Iara Kim", "Bento Sá", "Luz Okafor", "DJ Mirela"], desc: "Uma mesa de quarenta metros, 120 lugares, jantar a seis mãos e um DJ set que começa quando o sol se põe atrás do Centro.", doors: "19h · lugares marcados", age: "18+", addr: "Bela Vista · São Paulo – SP", prod: "Mesa Longa Experiências", prodBio: "Jantares coletivos com chefs convidados e trilha ao vivo.", timed: false },
  { id: "calourada", title: "Calourada Sem Fim", cat: "Festa", color: "#2C55F5", kinds: ["festas"], cats: ["funk"], venue: "Espaço Lago", city: "Brasília", uf: "DF", start: "2026-10-29T22:00", end: "2026-10-30T05:00", price: 35, pop: 2650, tagline: "A calourada que virou tradição na beira do lago.", lineup: ["DJ Rafa Satélite", "Bateria Inferno Azul", "Ressaca Moral"], desc: "A calourada que virou tradição na beira do lago. Bateria ao vivo, funk, pop e a noite inteira para fazer amigos novos.", doors: "22h · até 5h", age: "18+ com documento com foto", addr: "Brasília – DF", prod: "Atléticas Unidas BSB", prodBio: "Festas universitárias organizadas pelas atléticas de Brasília." },
  { id: "guitarra", title: "Guitarra Molhada", cat: "Rock & Indie", color: "#FF48B0", kinds: ["musica", "shows"], cats: ["rock"], venue: "Galpão 17", neighborhood: "Bairro do Recife", city: "Recife", uf: "PE", start: "2026-11-07T21:00", end: "2026-11-08T02:00", price: 55, pop: 890, tagline: "Três bandas da nova cena do Recife, volume no máximo.", lineup: ["Os Afogados", "Terra Bruta", "Lírio"], desc: "Três bandas de guitarra da nova cena do Recife, um galpão perto do porto e o volume no máximo do que a vizinhança aguenta.", doors: "20h", age: "16+", addr: "Bairro do Recife · Recife – PE", prod: "Galpão 17", prodBio: "Casa de shows independente dedicada à nova cena de guitarra do Recife." },
  { id: "terreiro", title: "Terreiro Eletrônico", cat: "Eletrônica", color: "#E9A23B", kinds: ["musica", "festivais", "festas"], cats: ["eletronica", "festivais"], venue: "Largo do Pelourinho", neighborhood: "Pelourinho", city: "Salvador", uf: "BA", start: "2026-11-28T16:00", end: "2026-11-29T02:00", price: 110, pop: 3120, tagline: "Afro house e percussão ao vivo no Pelourinho.", lineup: ["Ayô Bantu", "Nkiru", "Percussivo Malê", "Sankofa Sound"], desc: "Afro house, amapiano e percussão ao vivo no coração do Pelourinho. Dez horas de pista ao ar livre, do fim da tarde à madrugada.", doors: "15h30 · até 2h", age: "16+", addr: "Pelourinho · Salvador – BA", prod: "Terreiro Coletivo", prodBio: "Coletivo de afro house e percussão que ocupa o centro histórico de Salvador.", heroOrder: 3 },
  { id: "sintonia", title: "Sintonia 98.7", cat: "Show", color: "#7DF9FF", kinds: ["musica", "shows"], cats: ["funk"], venue: "Arena Norte", city: "Fortaleza", uf: "CE", start: "2026-11-15T19:00", end: "2026-11-15T23:59", price: 180, pop: 6870, tagline: "O show que a rádio do Ceará espera o ano inteiro.", lineup: ["MC Jade Fortal", "Os Brabos do Piseiro", "DJ Litoral"], desc: "O show que a rádio do Ceará espera o ano inteiro. Funk, piseiro e pop numa arena lotada e a cidade inteira cantando junto.", doors: "17h", age: "14+ · menores acompanhados", addr: "Fortaleza – CE", prod: "Rádio Sintonia 98.7", prodBio: "Rádio que realiza o maior show anual de funk e piseiro do Ceará.", heroOrder: 2 },
];

const CATS = [
  { id: "shows", name: "Shows", pic: "sintonia" },
  { id: "festas", name: "Festas", pic: "baile" },
  { id: "festivais", name: "Festivais", pic: "marea" },
  { id: "eletronica", name: "Eletrônica", pic: "subsolo" },
  { id: "hiphop", name: "Hip-hop & Rap", pic: "cypher" },
  { id: "arte", name: "Arte & Cultura", pic: "luz" },
  { id: "experiencias", name: "Experiências", pic: "mesa" },
  { id: "funk", name: "Funk", pic: "baile" },
  { id: "rock", name: "Rock & Indie", pic: "guitarra" },
  { id: "musica", name: "Música", pic: "sintonia" },
];

const PAL = [["#1E1E22", "#D3F55B"], ["#D3F55B", "#1E1E22"], ["#E9E7E0", "#55555A"], ["#2C55F5", "#FFE04A"], ["#FF4FD8", "#170A2B"], ["#C4532B", "#F2E3C6"]];
const POOL = ["Paredão do Futuro", "Fluxo Infinito", "Barra Funda 5h", "Tamborzão Digital", "Sem Pressa", "Luz Baixa", "Céu de Concreto", "Batida Nova", "Até o Sol", "Pista Aberta", "Linha 3", "Grave no Peito", "Madrugada", "Volume Máximo", "Onda Leste"];
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const fmt = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " mi" : Math.round(v / 1000) + " mil");

// datas em America/Sao_Paulo (UTC-3)
const sp = (iso: string) => new Date(iso + ":00-03:00");
const WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WDS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function labels(e: Ev) {
  const [d, t] = e.start.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const dow = sp(e.start).getUTCDay(); // Dom=0 — o offset -3 não muda o dia aqui (eventos à noite antes de 21h UTC? usamos data local)
  const local = new Date(Date.UTC(y, m - 1, dd));
  const wd = local.getUTCDay();
  void dow;
  const h = hh + "h" + (mm ? String(mm).padStart(2, "0") : "");
  return {
    dateLabel: e.range ?? `${WDS[wd]}, ${dd} ${MS[m - 1]} · ${h}`,
    dateFull: e.full ?? `${WD[wd]}, ${dd} de ${MO[m - 1]} de ${y}`,
  };
}

async function main() {
  console.log("Limpando tabelas…");
  await db.execute(sql`TRUNCATE TABLE tickets, order_items, orders, ticket_transfers, favorites, follows, coupons, ticket_types, event_artists, event_categories, events, artists, organizers, venues, categories, cities, newsletter_subscribers RESTART IDENTITY CASCADE`);

  // cidades
  const cityMap = new Map<string, string>();
  for (const e of E) {
    const key = `${e.city}-${e.uf}`;
    if (cityMap.has(key)) continue;
    const [c] = await db.insert(schema.cities).values({ slug: slugify(`${e.city}-${e.uf}`), name: e.city, uf: e.uf }).returning();
    cityMap.set(key, c.id);
  }

  // categorias
  const catMap = new Map<string, string>();
  for (const [i, c] of CATS.entries()) {
    const [row] = await db.insert(schema.categories).values({ slug: c.id, name: c.name, coverFlyer: c.pic, sortOrder: i }).returning();
    catMap.set(c.id, row.id);
  }

  // produtores, locais, artistas
  const orgMap = new Map<string, string>();
  const venueMap = new Map<string, string>();
  const artistMap = new Map<string, string>();

  for (const e of E) {
    if (!orgMap.has(e.prod)) {
      const w = e.prod.split(/\s+/);
      const [o] = await db.insert(schema.organizers).values({ slug: slugify(e.prod), name: e.prod, bio: e.prodBio, verified: true, initials: (w[0][0] + (w[1] ? w[1][0] : "")).toUpperCase() }).returning();
      orgMap.set(e.prod, o.id);
    }
    const vkey = `${e.venue}-${e.city}`;
    if (!venueMap.has(vkey)) {
      const [v] = await db.insert(schema.venues).values({ slug: slugify(vkey), name: e.venue, neighborhood: e.neighborhood ?? null, address: e.addr, cityId: cityMap.get(`${e.city}-${e.uf}`)! }).returning();
      venueMap.set(vkey, v.id);
    }
    for (const [k, name] of e.lineup.entries()) {
      if (artistMap.has(name)) continue;
      const h = hash(name);
      const pal = PAL[k % 6];
      const tracks = [0, 1, 2, 3, 4].map((j) => {
        const pl = ((h >>> (j + 2)) % 700 + 300) * 1000 * (5 - j) * 0.9;
        const sec = 140 + ((h >>> j) % 80);
        return { title: POOL[(h + j * 7) % POOL.length], plays: fmt(pl) + " plays", duration: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` };
      });
      const g = e.cat.toLowerCase();
      const [a] = await db.insert(schema.artists).values({
        slug: slugify(name), name, genre: e.cat, cityName: e.city, uf: e.uf, verified: k === 0,
        monthlyListeners: ((h % 880) + 40) * 1000, followersCount: ((h % 40) + 6) * 1000, showsCount: (h % 30) + 12, citiesCount: (h % 9) + 4,
        bio: [
          `${name} é um dos nomes mais comentados da cena de ${g} de ${e.city}. Com apresentações que viraram assunto nas redes e faixas que circulam de festa em festa, construiu um público fiel que acompanha cada lançamento e lota as pistas por onde passa.`,
          `A trajetória começou cedo, nas festas de bairro e nos encontros de rua de ${e.city}, onde ${name} testava faixas novas direto na pista e via, na hora, o que funcionava. Dali vieram os primeiros lançamentos independentes, gravados em estúdio caseiro e espalhados de mão em mão até chegar às playlists.`,
          `O som é marcado por graves pesados, letras que falam da cidade e uma energia de palco que não deixa ninguém parado. Nos últimos anos, ${name} dividiu line-up com nomes grandes da cena de ${g}, passou por festivais em várias capitais e virou presença certa nas noites mais disputadas do país.`,
          `Ao vivo, o show mistura repertório próprio, versões inéditas e momentos de improviso com o público. Em 2026, ${name} segue em turnê pelo Brasil e se apresenta no ${e.title}, em ${e.venue}.`,
        ].join("\n\n"),
        palette: { bg: pal[0], fg: pal[1], accent: PAL[(k + 1) % 6][0] },
        tracks,
        spotifyUrl: "https://open.spotify.com", youtubeUrl: "https://youtube.com", instagramUrl: "https://instagram.com", deezerUrl: "https://deezer.com",
      }).returning();
      artistMap.set(name, a.id);
    }
  }

  // eventos
  for (const e of E) {
    const L = labels(e);
    const hot = e.pop > 3000;
    const base = e.price;
    const tiers: { name: string; price: number; status: "open" | "sold_out" | "upcoming"; note: string }[] = hot
      ? [
          { name: "Pista — 1º lote", price: Math.round(base * 0.8), status: "sold_out", note: "Encerrado" },
          { name: "Pista — 2º lote", price: base, status: "open", note: "Disponível agora" },
          { name: "Pista — 3º lote", price: Math.round((base * 1.3) / 5) * 5, status: "upcoming", note: "Próxima virada de lote" },
        ]
      : [
          { name: "Pista — 1º lote", price: base, status: "open", note: "Disponível agora" },
          { name: "Pista — 2º lote", price: Math.round((base * 1.25) / 5) * 5, status: "upcoming", note: "Próxima virada de lote" },
        ];
    if (e.kinds.includes("festivais")) tiers.push({ name: "Passaporte — lote único", price: Math.round((base * 2.2) / 10) * 10, status: "open", note: "Todos os dias · acesso ao deck" });
    else if (e.kinds.includes("shows")) tiers.push({ name: "Pista premium — lote único", price: Math.round((base * 2) / 10) * 10, status: "open", note: "Frente do palco" });

    const [ev] = await db.insert(schema.events).values({
      slug: e.id, title: e.title, tagline: e.tagline, description: e.desc, descriptionParagraphs: e.paragraphs ?? null,
      flyerId: e.id, bannerId: e.id, accentColor: e.color,
      startAt: sp(e.start), endAt: sp(e.end), dateLabel: L.dateLabel, dateFullLabel: L.dateFull, timed: e.timed !== false,
      doorsLabel: e.doors, ageRating: e.age,
      halfPriceInfo: "Estudantes, PcD, jovens de baixa renda e maiores de 60, com documento.",
      refundPolicy: "Reembolso integral até 7 dias após a compra e, no máximo, 48h antes do evento, conforme o CDC.",
      venueId: venueMap.get(`${e.venue}-${e.city}`)!, addressLabel: e.addr, organizerId: orgMap.get(e.prod)!,
      primaryCategoryLabel: e.cat, kinds: Array.from(new Set([...e.kinds, ...e.cats])), popularity: e.pop,
      minPriceCents: Math.min(...tiers.filter((t) => t.status === "open").map((t) => t.price)) * 100,
      featured: true, heroOrder: e.heroOrder ?? null,
    }).returning();

    for (const [i, t] of tiers.entries()) {
      const qty = hot ? 1200 : 500;
      await db.insert(schema.ticketTypes).values({
        eventId: ev.id, name: t.name, note: t.note, priceCents: t.price * 100, feeCents: Math.round(t.price * 10),
        quantity: qty, sold: t.status === "sold_out" ? qty : Math.round(qty * (0.2 + (i * 0.1))), status: t.status, sortOrder: i,
      });
    }
    for (const c of Array.from(new Set([...e.kinds, ...e.cats]))) {
      const cid = catMap.get(c);
      if (cid) await db.insert(schema.eventCategories).values({ eventId: ev.id, categoryId: cid });
    }
    for (const [i, name] of e.lineup.entries()) {
      const st = sp(e.start); st.setMinutes(st.getMinutes() + i * 90);
      const local = new Date(st.getTime() - 3 * 3600 * 1000);
      const time = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
      await db.insert(schema.eventArtists).values({ eventId: ev.id, artistId: artistMap.get(name)!, sortOrder: i, timeLabel: time, role: i === 0 ? "Abertura" : i === e.lineup.length - 1 ? "Encerramento" : "Set ao vivo" });
    }
  }

  await db.insert(schema.coupons).values({ code: "ONDE10", percentOff: 10, active: true });
  console.log(`Seed concluído: ${E.length} eventos, ${artistMap.size} artistas, ${venueMap.size} locais, ${orgMap.size} produtores.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
