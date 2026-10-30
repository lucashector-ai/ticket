/*
 * E2E da portaria lendo o QR pela CÂMERA (Chromium com câmera falsa): o vídeo é o QR de verdade de um ingresso
 * de teste, tirado da página do ingresso (/ingressos/<código>) e convertido em .y4m por qr-y4m.mjs.
 * Só contra o servidor LOCAL com o banco de TESTE.
 *
 *   E2E_BASE=http://localhost:3042 E2E_EMAIL=... E2E_PASSWORD=... E2E_EVENT=<slug de um evento da conta> \
 *   TEST_DATABASE_URL=<branch Neon de teste> NODE_PATH=$(npm root -g) node tests/e2e/portaria-camera.e2e.mjs
 *
 * A conta precisa ser dona (ou da equipe) do evento. O teste cria no banco de teste um pedido de teste com
 * 4 ingressos na conta (e um evento "outro" do mesmo produtor), lê cada QR pela câmera e apaga tudo no fim:
 *   válido → liberado · o mesmo de novo → "Ingresso já utilizado." · de outro evento · reembolsado · cancelado ·
 *   QR adulterado (assinatura trocada) → "QR code inválido…".
 * E2E_KEEP=1 mantém os vídeos .y4m e os prints na pasta E2E_OUT (padrão: pasta temporária).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { grayFromSvg, grayFromText, readGray, writeY4m } from "./qr-y4m.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { neon } = createRequire(new URL("../../package.json", import.meta.url))("@neondatabase/serverless");

const base = process.env.E2E_BASE ?? "http://localhost:3042";
const need = ["E2E_EMAIL", "E2E_PASSWORD", "E2E_EVENT", "TEST_DATABASE_URL"].filter((k) => !process.env[k]);
if (need.length) { console.error("faltam:", need.join(", ")); process.exit(2); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) { console.error("só contra o servidor local"); process.exit(2); }
if (process.env.DATABASE_URL_PROD && process.env.DATABASE_URL_PROD === process.env.TEST_DATABASE_URL) { console.error("TEST_DATABASE_URL é a produção: recusado"); process.exit(2); }

const sql = neon(process.env.TEST_DATABASE_URL);
const out = process.env.E2E_OUT ?? mkdtempSync(join(tmpdir(), "portaria-cam-"));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FALHOU"} ${what}`); if (!cond) process.exitCode = 1; };
const code = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = randomBytes(8); let s = ""; for (const x of b) s += a[x % a.length]; return `TW-${s.slice(0, 4)}-${s.slice(4)}`; };

const [ev] = await sql`select e.id, e.title, e.organizer_id, coalesce(g.owner_user_id, e.created_by_user_id) as owner, (select id from ticket_types where event_id = e.id order by sort_order limit 1) as tt
  from events e left join organizers g on g.id = e.organizer_id where e.slug = ${process.env.E2E_EVENT}`;
if (!ev?.tt) { console.error("evento sem tipo de ingresso"); process.exit(2); }
const created = { events: [], orders: [] };
const b = await chromium.launch();
try {
  // evento "outro" do mesmo produtor e um pedido de teste com 4 ingressos na conta (A, B no outro evento, C, D)
  const [other] = await sql`insert into events (slug, title, status, start_at, organizer_id, created_by_user_id)
    values (${`qa-e2e-portaria-outro-${randomBytes(3).toString("hex")}`}, 'QA outro evento (e2e portaria)', 'published', now() + interval '20 days', ${ev.organizer_id}, ${ev.owner}) returning id`;
  created.events.push(other.id);
  const [ott] = await sql`insert into ticket_types (event_id, name, price_cents, quantity) values (${other.id}, 'Pista', 0, 10) returning id`;
  const mkOrder = async (eventId) => {
    const [o] = await sql`insert into orders (user_id, event_id, status, payment_method, payment_ref, paid_at, buyer_name) values (${ev.owner}, ${eventId}, 'paid', 'free', ${`TEST-e2e-${randomBytes(3).toString("hex")}`}, now(), 'Pessoa Teste QA') returning id`;
    created.orders.push(o.id);
    return o.id;
  };
  const oMain = await mkOrder(ev.id), oOther = await mkOrder(other.id);
  const mk = async (orderId, eventId, typeId) => {
    const c = code();
    await sql`insert into tickets (code, order_id, event_id, ticket_type_id, holder_user_id, holder_name, secret) values (${c}, ${orderId}, ${eventId}, ${typeId}, ${ev.owner}, 'Pessoa Teste QA', ${randomBytes(16).toString("hex")})`;
    return c;
  };
  const T = { valido: await mk(oMain, ev.id, ev.tt), outro: await mk(oOther, other.id, ott.id), reembolsado: await mk(oMain, ev.id, ev.tt), cancelado: await mk(oMain, ev.id, ev.tt) };

  const ctx = await b.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("/entrar", { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', process.env.E2E_EMAIL);
  await p.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await p.keyboard.press("Enter");
  await p.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 20_000 });
  const state = join(out, "state.json");
  await ctx.storageState({ path: state });

  // o QR de verdade de cada ingresso, como a pessoa vê na página do ingresso
  const video = {};
  for (const [k, c] of Object.entries(T)) {
    await p.goto(`/ingressos/${c}`, { waitUntil: "networkidle" });
    const g = await grayFromSvg(p, ".qr svg");
    const text = readGray(g);
    ok(!!text && text.startsWith(`ONDE|${c}|`), `QR da página do ingresso ${k} lido (${c})`);
    video[k] = writeY4m(join(out, `${k}.y4m`), g);
    if (k === "valido") {
      // adulterado: o mesmo ingresso com a assinatura trocada (último caractere)
      const sig = text.split("|")[2];
      const fake = `ONDE|${c}|${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
      video.adulterado = writeY4m(join(out, "adulterado.y4m"), grayFromText(fake));
    }
  }
  await ctx.close();
  await sql`update tickets set status = 'refunded' where code = ${T.reembolsado}`;
  await sql`update tickets set status = 'cancelled' where code = ${T.cancelado}`;

  /** Abre a portaria do evento com a câmera falsa mostrando `file` e devolve o resultado na tela. */
  async function scan(name, file) {
    const br = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`] });
    try {
      const c = await br.newContext({ baseURL: base, storageState: state, permissions: ["camera"], viewport: { width: 390, height: 844 } });
      const pg = await c.newPage();
      const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
      await pg.goto(`/painel/portaria/${ev.id}`, { waitUntil: "networkidle" });
      await pg.click("text=Abrir câmera");
      const res = pg.locator(".prt-res[role=status]");
      await res.waitFor({ timeout: 25_000 });
      const shot = { ok: await pg.locator(".prt-cam.ok").count() === 1, text: (await res.innerText()).replace(/\s+/g, " ").trim(), errs };
      await pg.screenshot({ path: join(out, `${name}.png`) });
      return shot;
    } finally { await br.close(); }
  }

  const r1 = await scan("1-valido", video.valido);
  ok(r1.ok && /Pessoa Teste QA/.test(r1.text) && r1.text.includes(T.valido), `válido: entrada liberada, tela verde (${r1.text})`);
  const [st] = await sql`select status, checked_in_at is not null as dentro from tickets where code = ${T.valido}`;
  ok(st.status === "used" && st.dentro, "válido: marcado como usado no banco");
  const r2 = await scan("2-ja-usado", video.valido);
  ok(!r2.ok && r2.text.includes("Ingresso já utilizado."), `já usado: ${r2.text}`);
  const r3 = await scan("3-outro-evento", video.outro);
  ok(!r3.ok && r3.text.includes("Este ingresso é de outro evento (QA outro evento (e2e portaria))."), `outro evento: ${r3.text}`);
  const r4 = await scan("4-reembolsado", video.reembolsado);
  ok(!r4.ok && r4.text.includes("Ingresso reembolsado."), `reembolsado: ${r4.text}`);
  const r5 = await scan("5-cancelado", video.cancelado);
  ok(!r5.ok && r5.text.includes("Ingresso cancelado."), `cancelado: ${r5.text}`);
  const r6 = await scan("6-adulterado", video.adulterado);
  ok(!r6.ok && r6.text.includes("QR code inválido"), `adulterado: ${r6.text}`);
  const [st2] = await sql`select count(*) filter (where status = 'used') as usados from tickets where code in (${T.reembolsado}, ${T.cancelado}, ${T.outro})`;
  ok(Number(st2.usados) === 0, "nenhum ingresso recusado foi marcado como usado");
  const errs = [r1, r2, r3, r4, r5, r6].flatMap((r) => r.errs);
  ok(errs.length === 0, `sem erro de JavaScript${errs.length ? `: ${errs.join("; ")}` : ""}`);
} catch (e) {
  ok(false, `fluxo interrompido: ${String(e.message).split("\n")[0]}`);
} finally {
  await b.close();
  // limpeza: tudo que o teste criou no banco de teste
  for (const id of created.orders) { await sql`delete from tickets where order_id = ${id}`; await sql`delete from orders where id = ${id}`; }
  for (const id of created.events) { await sql`delete from ticket_types where event_id = ${id}`; await sql`delete from events where id = ${id}`; }
  if (process.env.E2E_KEEP) console.log(`vídeos e prints em ${out}`); else rmSync(out, { recursive: true, force: true });
}
