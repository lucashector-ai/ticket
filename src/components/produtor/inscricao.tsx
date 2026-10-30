"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitApplication, type AppInput } from "@/lib/actions/inscricao";
import { PhoneField } from "@/components/phone-field";
import { CitySelect, UfSelect } from "@/components/city-select";

type App = { status: "pending" | "rejected"; createdAt: string; note: string | null; company: string | null; city: string; uf: string; category: string } | null;
type Props = { email: string; firstName: string; lastName: string; phone: string; app: App; ufs: readonly string[]; categories: readonly string[]; sources: readonly string[] };

const STEPS = [
  { t: "Inscrição", s: "Conte sobre você e seus eventos. Leva 2 minutos." },
  { t: "Aprovação no mesmo dia", s: "Nossa equipe confere e responde por e-mail no mesmo dia útil." },
  { t: "Sua página e o 1º evento", s: "Você monta sua página de produtor e começa a vender." },
];
const PERKS = [
  ["7,99% por ingresso", "Sem mensalidade. Evento gratuito não paga nada."],
  ["Repasse rápido", "O dinheiro fica disponível 2 dias depois do evento."],
  ["Check-in no celular", "Portaria com leitor de QR code, sem app para baixar."],
  ["Gente de verdade", "Suporte humano antes, durante e depois do evento."],
] as const;

const moneyMask = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 7);
  return d ? (Number(d) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};
const intMask = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 6); return d ? Number(d).toLocaleString("pt-BR") : ""; };

/** /criar-evento para quem ainda não é produtor: como funciona, a inscrição e o status da análise. */
export function ProducerApply(p: Props) {
  const router = useRouter();
  const [form, setForm] = useState(p.app?.status !== "pending" && !p.app);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    firstName: p.firstName, lastName: p.lastName, phone: p.phone, company: "", city: "", uf: "", audience: "", category: "",
    avgTicket: "", expected: "", source: "", instagram: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => { setF((o) => ({ ...o, ...patch })); setErr(null); };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await submitApplication(f as AppInput).catch(() => ({ ok: false, error: "Não foi possível enviar agora. Tente de novo." }));
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Confira os campos."); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }

  const pending = done || p.app?.status === "pending";
  return (
    <main className="wrap ins">
      <section className="ins-intro">
        <span className="ins-k"><i aria-hidden="true" />Para produtores</span>
        <h1 className="ins-h">Antes do primeiro evento, uma inscrição rápida.</h1>
        <p className="ins-lead">Cada produtor é aprovado pela equipe da Tickets Win. Assim a plataforma continua segura para quem compra ingresso e justa para quem produz. A gente responde no mesmo dia útil.</p>
        <ol className="ins-steps">
          {STEPS.map((s, i) => (
            <li key={s.t} className={pending ? (i === 0 ? "ok" : i === 1 ? "on" : "") : i === 0 ? "on" : ""}>
              <span className="ins-n" aria-hidden="true">{pending && i === 0 ? "✓" : i + 1}</span>
              <span><b>{s.t}</b><small>{s.s}</small></span>
            </li>
          ))}
        </ol>
        <ul className="ins-perks">
          {PERKS.map(([t, s]) => <li key={t}><b>{t}</b><span>{s}</span></li>)}
        </ul>
        <p className="ins-more">Quer conhecer tudo antes? <Link href="/produtores">Veja a Tickets Win para produtores</Link>.</p>
      </section>

      <section className="ins-side">
        {pending ? (
          <div className="ins-card ins-wait">
            <span className="ins-pulse" aria-hidden="true" />
            <h2 className="ins-ct">{done ? "Inscrição enviada!" : "Sua inscrição está em análise"}</h2>
            <p>Respondemos no mesmo dia útil no e-mail <b>{p.email}</b>. Assim que for aprovada, você recebe o link para montar sua página de produtor.</p>
            {p.app && !done && <dl className="ins-sum"><div><dt>Enviada em</dt><dd>{new Date(p.app.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}</dd></div><div><dt>Produtora</dt><dd>{p.app.company || "—"}</dd></div><div><dt>Cidade</dt><dd>{p.app.city} – {p.app.uf}</dd></div><div><dt>Categoria</dt><dd>{p.app.category}</dd></div></dl>}
            <Link className="ins-btn ghost" href="/explorar">Enquanto isso, explorar eventos</Link>
          </div>
        ) : !form && p.app?.status === "rejected" ? (
          <div className="ins-card">
            <h2 className="ins-ct">Sua inscrição não foi aprovada agora</h2>
            <p>{p.app.note || "Não conseguimos liberar a criação de eventos com as informações enviadas."}</p>
            <p className="ins-fine">Você pode mandar uma nova inscrição com mais detalhes sobre seus eventos, ou falar com a gente pela <Link href="/ajuda">Ajuda</Link>.</p>
            <button className="ins-btn" type="button" onClick={() => setForm(true)}>Enviar nova inscrição</button>
          </div>
        ) : (
          <form className="ins-card ins-form" onSubmit={send} noValidate>
            <h2 className="ins-ct">Inscrição de produtor</h2>
            <p className="ins-fine">Entrando como <b>{p.email}</b>. Todos os campos com * são obrigatórios.</p>

            <fieldset>
              <legend>Sobre você</legend>
              <div className="ins-g2">
                <label className="ins-f"><span>Nome *</span><input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" /></label>
                <label className="ins-f"><span>Sobrenome *</span><input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" /></label>
              </div>
              <div className="ins-f"><span>Telefone (WhatsApp) *</span><PhoneField value={f.phone} onChange={(v) => set({ phone: v })} /></div>
            </fieldset>

            <fieldset>
              <legend>Seus eventos</legend>
              <label className="ins-f"><span>Nome da produtora</span><input autoComplete="off" value={f.company} onChange={(e) => set({ company: e.target.value })} placeholder="Se tiver" maxLength={120} /></label>
              <div className="ins-g2 city">
                <label className="ins-f"><span>Estado *</span><UfSelect value={f.uf} onChange={(uf) => set({ uf })} /></label>
                <label className="ins-f"><span>Cidade do evento *</span><CitySelect uf={f.uf} value={f.city} onChange={(city) => set({ city })} /></label>
              </div>
              <div className="ins-f"><span>Categoria do evento *</span>
                <div className="ins-chips" role="radiogroup" aria-label="Categoria do evento">
                  {p.categories.map((c) => <button key={c} type="button" role="radio" aria-checked={f.category === c} className={f.category === c ? "on" : undefined} onClick={() => set({ category: c })}>{c}</button>)}
                </div>
              </div>
              <label className="ins-f"><span>Público-alvo *</span><textarea rows={3} value={f.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Conte as características do público: idade, estilo, de onde vem, o que curte." maxLength={600} /></label>
              <div className="ins-g2">
                <label className="ins-f"><span>Ticket médio *</span><span className="ins-pre"><b>R$</b><input autoComplete="off" inputMode="numeric" value={f.avgTicket} onChange={(e) => set({ avgTicket: moneyMask(e.target.value) })} placeholder="0,00" /></span><small>Valor médio do ingresso</small></label>
                <label className="ins-f"><span>Público esperado *</span><input autoComplete="off" inputMode="numeric" value={f.expected} onChange={(e) => set({ expected: intMask(e.target.value) })} placeholder="Ex.: 400" /><small>Pessoas por evento</small></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Para fechar</legend>
              <label className="ins-f"><span>Como chegou até a Tickets Win? *</span><select value={f.source} onChange={(e) => set({ source: e.target.value })}><option value="">Escolha uma opção</option>{p.sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="ins-f"><span>Instagram da produtora ou do evento</span><span className="ins-pre"><b>@</b><input autoComplete="off" value={f.instagram.replace(/^@/, "")} onChange={(e) => set({ instagram: e.target.value })} placeholder="suaprodutora" autoCapitalize="off" /></span></label>
            </fieldset>

            {err && <p className="ins-err" role="alert">{err}</p>}
            <button className="ins-btn" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar inscrição"}</button>
            <p className="ins-fine">Ao enviar, você concorda com os <Link href="/legal/termos">Termos de uso</Link> e a <Link href="/legal/privacidade">Política de privacidade</Link>.</p>
          </form>
        )}
      </section>
    </main>
  );
}
