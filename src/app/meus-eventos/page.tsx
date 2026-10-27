import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { FlyerArt } from "@/components/art/flyer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus eventos" };

/** Eventos criados pelo usuário em /criar-evento, com atalho para editar. */
export default async function MeusEventosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/meus-eventos");
  const rows = await db.query.events.findMany({
    where: eq(schema.events.createdByUserId, user.id),
    columns: { id: true, slug: true, title: true, status: true, unlisted: true, dateLabel: true, flyerId: true },
    with: { ticketTypes: { columns: { sold: true, quantity: true } } },
    orderBy: [desc(schema.events.updatedAt)],
  });
  const org = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, user.id), columns: { slug: true } });
  const headerUser = { id: user.id, name: user.name, email: user.email, image: user.image };
  const statusLabel = (r: (typeof rows)[number]) => (r.status === "draft" ? "Rascunho" : r.unlisted ? "Publicado · só com link" : "Publicado");

  return (
    <div className="pg-criar">
      <SiteHeader user={headerUser} variant="default" />
      <main className="wrap ce me-ev">
        <div className="ce-top">
          <div>
            <span className="ce-k">Tickets Win para produtores</span>
            <h1 className="ce-h">Meus eventos</h1>
          </div>
          <div className="ce-ta"><Link className="b-sec" href="/painel">Painel</Link>{org && <Link className="b-sec" href={`/produtor/${org.slug}`}>Minha página</Link>}<Link className="b-pri" href="/criar-evento">+ Criar evento</Link></div>
        </div>
        {!rows.length ? (
          <div className="ss-empty">Você ainda não criou nenhum evento.</div>
        ) : (
          <div className="chk">
            {rows.map((r) => {
              const sold = r.ticketTypes.reduce((s, t) => s + t.sold, 0);
              const total = r.ticketTypes.reduce((s, t) => s + t.quantity, 0);
              return (
                <div key={r.id} className={r.status === "draft" ? "ckr warn" : "ckr"}>
                  <span className="me-art"><FlyerArt id={r.flyerId} /></span>
                  <span className="ck-i2">
                    <b className="ck-t">{r.title}</b>
                    <span className="ck-s">{statusLabel(r)} · {r.dateLabel ?? "Sem data"} · {sold.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} ingressos vendidos</span>
                  </span>
                  <Link className="b-ghost sm" href={`/eventos/${r.slug}`}>{r.status === "draft" ? "Prévia" : "Ver página"}</Link>
                  <Link className="b-sec sm" href={`/criar-evento?editar=${r.id}`}>Editar</Link>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
