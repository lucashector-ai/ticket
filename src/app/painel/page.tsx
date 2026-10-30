import { redirect } from "next/navigation";
import { PainelHome, type HomeProps } from "@/components/painel/home";
import { latestPaid, paidBuckets } from "@/lib/data/painel";
import { painelAccess } from "@/lib/painel/access";
import { brl, normalize } from "@/lib/format";
import { DAY, capacity, ended, feedItem, nowMs, soldCount, statusOf, whenLabel, whereLabel } from "@/lib/painel/build";
import { homeKpis, netByEvent, sparkStart } from "@/lib/painel/home";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function PainelInicio({ searchParams }: Props) {
  const { q } = await searchParams;
  const { user, org, role, events } = await painelAccess("admin");
  // quem ainda não é produtor (sem página e sem eventos) passa primeiro pelo cadastro
  if (role === "owner" && !org?.onboarding && !events.length) redirect("/produtores/cadastro");
  const absorb = new Map(events.map((e) => [e.id, e.absorbFee]));
  const now = nowMs();
  const ids = events.map((e) => e.id);
  // somado no banco (por evento, valor, quantidade, dia e janela), sem trazer os pedidos um a um; o feed traz só os últimos
  const [rows, latest] = await Promise.all([paidBuckets(ids, now, sparkStart(now, 7)), latestPaid(ids, absorb, 6)]);
  const title = new Map(events.map((e) => [e.id, e.title]));

  /* indicadores por período: atual × anterior, com minilinha de 10 pontos */
  const kpis = homeKpis(rows, absorb, now);

  /* lista de eventos */
  const netBy = netByEvent(rows, absorb);
  const qn = q ? normalize(q) : "";
  const evs = events.filter((e) => !qn || normalize(e.title).includes(qn)).map((e) => {
    const cap = capacity(e), sold = soldCount(e), st = statusOf(e, now);
    const tab = e.status === "draft" ? "draft" : ended(e, now) ? "end" : "sale";
    return {
      id: e.id, title: e.title, flyerId: e.flyerId, when: whenLabel(e), where: whereLabel(e), status: st.label, stCls: st.cls, tab,
      soldLabel: cap ? `${sold.toLocaleString("pt-BR")} / ${cap.toLocaleString("pt-BR")}` : sold.toLocaleString("pt-BR"),
      pct: cap ? Math.min(100, Math.round((sold / cap) * 100)) : 0, revenue: brl(netBy.get(e.id) ?? 0),
      href: tab === "draft" ? `/criar-evento?editar=${e.id}` : `/painel/evento/${e.id}`, cta: tab === "draft" ? "Continuar" : "Abrir",
    };
  });

  /* o que precisa de atenção */
  const todos: HomeProps["todos"] = [];
  for (const e of events) {
    if (e.status === "draft") {
      todos.push({ id: `draft-${e.id}`, cls: "td blue", title: `${e.title} ainda é rascunho`, text: "Termine as etapas e publique para começar a vender.", cta: "Continuar", href: `/criar-evento?editar=${e.id}` });
      continue;
    }
    if (ended(e, now)) continue;
    for (const t of e.ticketTypes) {
      const left = t.quantity - t.sold;
      if (t.status === "open" && t.quantity > 0 && left > 0 && left / t.quantity <= 0.15) {
        todos.push({ id: `low-${t.id}`, cls: "td warn", title: `${[t.sector, t.name].filter(Boolean).join(" · ")} está acabando`, text: `${e.title} · restam ${left} de ${t.quantity}.`, cta: "Abrir lotes", href: `/criar-evento?editar=${e.id}` });
      }
    }
    const days = Math.ceil((e.startAt.getTime() - now) / DAY);
    if (days >= 0 && days <= 3) todos.push({ id: `soon-${e.id}`, cls: "td", title: `${e.title} ${days === 0 ? "é hoje" : days === 1 ? "é amanhã" : `é em ${days} dias`}`, text: "Confira a lista de participantes e prepare o check-in.", cta: "Ver evento", href: `/painel/evento/${e.id}?aba=checkin` });
  }

  const onSale = evs.filter((e) => e.tab === "sale").length;
  const futureNet = events.filter((e) => !ended(e, now)).reduce((s, e) => s + (netBy.get(e.id) ?? 0), 0);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const props: HomeProps = {
    greeting: `${hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}, ${(user.name || "produtor").split(" ")[0]}`,
    sub: `${org?.name ?? "Seus eventos"} · ${onSale} ${onSale === 1 ? "evento" : "eventos"} à venda`,
    query: q ?? "",
    kpis, todos, events: evs,
    feed: latest.map((o) => feedItem(o, title.get(o.eventId) ?? null)),
    futureNet: brl(futureNet),
  };
  return <PainelHome {...props} />;
}
