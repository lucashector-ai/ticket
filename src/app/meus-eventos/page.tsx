import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { isProducer } from "@/lib/data/producer";
import { FlyerArt } from "@/components/art/flyer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { nowMs } from "@/lib/painel/build";
import { eventLabels } from "@/lib/tickets/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus eventos" };

/** Eventos criados pelo usuário em /criar-evento: status, vendas e atalhos para o painel, a página e a edição. */
export default async function MeusEventosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/meus-eventos");
  // só produtor tem Meus eventos: quem ainda não é vai para o cadastro de produtor
  if (!(await isProducer(user))) redirect("/criar-evento");
  const rows = await db.query.events.findMany({
    where: eq(schema.events.createdByUserId, user.id),
    with: { venue: { with: { city: true } }, ticketTypes: { columns: { sold: true, quantity: true } } },
    orderBy: [desc(schema.events.updatedAt)],
  });
  const org = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, user.id), columns: { slug: true } });
  const headerUser = { id: user.id, name: user.name, email: user.email, image: user.image };
  const now = nowMs();
  const list = rows.map((r) => {
    const L = eventLabels(r);
    const sold = r.ticketTypes.reduce((s, t) => s + t.sold, 0);
    const total = r.ticketTypes.reduce((s, t) => s + t.quantity, 0);
    const past = (r.endAt ?? r.startAt).getTime() < now;
    const status = r.status === "draft" ? { k: "draft", t: "Rascunho" } : past ? { k: "past", t: "Encerrado" } : r.unlisted ? { k: "link", t: "Só com link" } : { k: "live", t: "No ar" };
    return { r, L, sold, total, pct: total ? Math.min(100, Math.round((sold / total) * 100)) : 0, status };
  });
  const live = list.filter((x) => x.status.k === "live" || x.status.k === "link").length;
  const sold = list.reduce((s, x) => s + x.sold, 0);

  return (
    <div className="pg-meus-eventos">
      <SiteHeader user={headerUser} variant="default" />
      <main className="wrap me">
        <header className="me-top">
          <div>
            <span className="me-k">Tickets Win para produtores</span>
            <h1 className="me-h">Meus eventos</h1>
          </div>
          <nav className="me-act">
            <Link className="me-b" href="/painel">Painel</Link>
            {org && <Link className="me-b" href={`/produtor/${org.slug}`}>Minha página</Link>}
            <Link className="me-b pri" href="/criar-evento">+ Criar evento</Link>
          </nav>
        </header>

        {list.length > 0 && (
          <div className="me-sum">
            <div><b>{list.length}</b><span>{list.length === 1 ? "evento" : "eventos"}</span></div>
            <div><b>{live}</b><span>no ar</span></div>
            <div><b>{sold.toLocaleString("pt-BR")}</b><span>ingressos vendidos</span></div>
          </div>
        )}

        {!list.length ? (
          <div className="me-empty">
            <b>Seu primeiro evento começa aqui</b>
            <span>Leva uns 5 minutos: tipo, data, local, ingressos e pronto.</span>
            <Link className="me-b pri" href="/criar-evento">Criar evento</Link>
          </div>
        ) : (
          <ul className="me-list">
            {list.map(({ r, L, sold, total, pct, status }) => (
              <li key={r.id} className="me-ev">
                <Link className="me-art" href={`/criar-evento?editar=${r.id}`} aria-label={`Editar ${r.title}`}><FlyerArt id={r.flyerId} /></Link>
                <div className="me-i">
                  <span className={`me-st ${status.k}`}>{status.t}</span>
                  <b className="me-t">{r.title}</b>
                  <span className="me-d">{r.status === "draft" && !r.dateLabel ? "Sem data definida" : L.dateNice}{L.venue ? ` · ${L.venue}` : ""}</span>
                  {total > 0 && (
                    <div className="me-sold">
                      <div className="me-bar"><i style={{ width: `${pct}%` }} /></div>
                      <span>{sold.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} vendidos</span>
                    </div>
                  )}
                </div>
                <div className="me-go">
                  {r.status !== "draft" && <Link className="me-b sm" href={`/painel/evento/${r.id}`}>Painel do evento</Link>}
                  <Link className="me-b sm" href={`/eventos/${r.slug}`}>{r.status === "draft" ? "Prévia" : "Ver página"}</Link>
                  <Link className="me-b sm pri" href={`/criar-evento?editar=${r.id}`}>Editar</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
