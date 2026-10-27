import { PainelHome, type HomeProps } from "@/components/painel/home";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope, listOrders } from "@/lib/data/painel";
import { brl, normalize } from "@/lib/format";
import { DAY, capacity, daily, delta, ended, feedItem, nowMs, soldCount, spark, statusOf, whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function PainelInicio({ searchParams }: Props) {
  const user = (await getSessionUser())!;
  const { q } = await searchParams;
  const { org, events } = await getPainelScope(user.id);
  const absorb = new Map(events.map((e) => [e.id, e.absorbFee]));
  const orders = await listOrders(events.map((e) => e.id), absorb);
  const paid = orders.filter((o) => o.status === "paid");
  const title = new Map(events.map((e) => [e.id, e.title]));
  const now = nowMs();

  /* indicadores por período: atual × anterior, com minilinha de 10 pontos */
  const PERIODS = [["7d", "7 dias", 7], ["30d", "30 dias", 30], ["all", "Tudo", 0]] as const;
  const first = paid.length ? Math.min(...paid.map((o) => o.at.getTime())) : now;
  const kpis = Object.fromEntries(PERIODS.map(([key, , d]) => {
    const days = d || Math.max(10, Math.ceil((now - first) / DAY) + 1);
    const inP = paid.filter((o) => o.at.getTime() >= now - days * DAY);
    const prevP = d ? paid.filter((o) => o.at.getTime() < now - days * DAY && o.at.getTime() >= now - 2 * days * DAY) : [];
    const sum = (l: typeof paid, f: (o: (typeof paid)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
    const rev = sum(inP, (o) => o.net), tix = sum(inP, (o) => o.qty), n = inP.length;
    const pRev = sum(prevP, (o) => o.net), pTix = sum(prevP, (o) => o.qty), pN = prevP.length;
    const avg = tix ? Math.round(rev / tix) : 0, pAvg = pTix ? Math.round(pRev / pTix) : 0;
    const bucket = (f: (o: (typeof paid)[number]) => number) => {
      const per = daily(inP, days, f, now).values, step = Math.ceil(days / 10);
      return Array.from({ length: 10 }, (_, i) => per.slice(i * step, (i + 1) * step).reduce((a, b) => a + b, 0));
    };
    const note = d ? `vs ${d} dias anteriores` : "desde a primeira venda";
    const mk = (label: string, value: string, cur: number, prev: number, series: number[]) => ({ label, value, ...(d ? delta(cur, prev) : { text: "", cls: "dl" }), note, ...spark(series) });
    return [key, [
      mk("Receita líquida", brl(rev), rev, pRev, bucket((o) => o.net)),
      mk("Ingressos vendidos", tix.toLocaleString("pt-BR"), tix, pTix, bucket((o) => o.qty)),
      mk("Pedidos", n.toLocaleString("pt-BR"), n, pN, bucket(() => 1)),
      mk("Ticket médio", brl(avg), avg, pAvg, bucket((o) => o.net / Math.max(1, o.qty))),
    ]];
  })) as HomeProps["kpis"];

  /* lista de eventos */
  const netBy = new Map<string, number>();
  for (const o of paid) netBy.set(o.eventId, (netBy.get(o.eventId) ?? 0) + o.net);
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
  const futureNet = paid.filter((o) => { const e = events.find((x) => x.id === o.eventId); return e && !ended(e, now); }).reduce((s, o) => s + o.net, 0);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const props: HomeProps = {
    greeting: `${hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}, ${(user.name || "produtor").split(" ")[0]}`,
    sub: `${org?.name ?? "Seus eventos"} · ${onSale} ${onSale === 1 ? "evento" : "eventos"} à venda`,
    query: q ?? "",
    kpis, todos, events: evs,
    feed: paid.slice(0, 6).map((o) => feedItem(o, title.get(o.eventId) ?? null)),
    futureNet: brl(futureNet),
  };
  return <PainelHome {...props} />;
}
