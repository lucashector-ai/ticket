import "server-only";
import { asc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/*
 * Rastro dos ingressos para a central da Tickets Win (D-12). Só a central lê (a página já exige e-mail de admin,
 * confirmado, com app autenticador); produtor e comprador nunca veem.
 *
 * Fonte: `ticket_events`, gravada na mesma transação de cada operação. Ingressos de antes da tabela (ou passos que
 * ela não registra, como anunciar e retirar da revenda) são montados aqui a partir de pedidos, transferências,
 * anúncios, reembolsos e check-in, sem migração. Passo montado assim vem com `rebuilt: true` e nunca duplica um
 * registrado: a transferência, o anúncio e a linha de reembolso são comparados pelo id.
 */

export type TrailKind =
  | "emitido" | "presente" | "presente_aceito"
  | "transferencia_enviada" | "transferencia_reenviada" | "transferencia_aceita" | "transferencia_cancelada"
  | "revenda_anunciada" | "revenda_vendida" | "revenda_retirada"
  | "reembolso" | "cancelado" | "checkin" | "checkin_recusado";

/** `who`: quem fez (conta "Nome · e-mail", ou o operador da portaria); `to`: quem recebeu (conta ou e-mail de destino). */
export type TrailStep = {
  at: Date; kind: TrailKind; who?: string | null; to?: string | null; amountCents?: number | null;
  /** código do ingresso depois do passo */
  code?: string | null; note?: string | null;
  /** montado a partir dos dados antigos (ingresso de antes do rastro) */
  rebuilt?: boolean;
};
export type TrailHolder = { name: string | null; email: string | null; since: Date; via: "compra" | "presente" | "transferencia" | "revenda" };
export type AdminTrail = {
  id: string; code: string; prevCodes: string[]; status: string; type: string; kind: string | null; half: boolean;
  event: { title: string; slug: string; startAt: Date };
  order: { number: string | null; buyer: string | null; email: string | null } | null;
  /** titular atual: nome no ingresso e e-mail da conta que está com ele */
  holder: { name: string | null; email: string | null };
  /** do primeiro ao atual */
  holders: TrailHolder[];
  /** do mais antigo ao mais novo */
  steps: TrailStep[];
  rebuilt: boolean;
};

const MAX = 20;
const CODE_RE = /^(TW|ONDE)-?([A-Z0-9]{4})-?([A-Z0-9]{4})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** O que a busca entende: código (atual ou anterior, com ou sem hífen), e-mail ou número do pedido. */
export function parseTrailQuery(q: string): { code: string } | { email: string } | { order: number } | null {
  const s = q.trim();
  const c = CODE_RE.exec(s.toUpperCase().replace(/\s+/g, ""));
  if (c) return { code: `${c[1]}-${c[2]}-${c[3]}` };
  if (EMAIL_RE.test(s)) return { email: s.toLowerCase() };
  const n = /^#?(\d{1,9})$/.exec(s);
  if (n) return { order: Number(n[1]) };
  return null;
}

const ids = (r: { rows: { id: string }[] }) => [...new Set(r.rows.map((x) => x.id))];

async function findTicketIds(q: NonNullable<ReturnType<typeof parseTrailQuery>>): Promise<string[]> {
  const { tickets, ticketEvents, orderRefunds, orders, ticketTransfers, resaleListings, userProfiles } = schema;
  if ("code" in q) {
    return ids(await db.execute<{ id: string }>(sql`
      select id::text from ${tickets} where code = ${q.code}
      union select ticket_id::text from ${ticketEvents} where code = ${q.code} or prev_code = ${q.code}
      union select (r.ticket_ids ->> (x.i - 1)::int) from ${orderRefunds} r, jsonb_array_elements_text(r.ticket_codes) with ordinality x(c, i)
        where r.ticket_codes ? ${q.code} and x.c = ${q.code}
      limit ${MAX}`));
  }
  if ("order" in q) {
    return ids(await db.execute<{ id: string }>(sql`
      select t.id::text from ${tickets} t join ${orders} o on o.id = t.order_id where o.number = ${q.order}
      union select (r.ticket_ids ->> x.i)::text from ${orderRefunds} r join ${orders} o on o.id = r.order_id, generate_series(0, jsonb_array_length(coalesce(r.ticket_ids, '[]'::jsonb)) - 1) x(i)
        where o.number = ${q.order}
      limit ${MAX}`));
  }
  const e = q.email;
  // contas com o e-mail: perfil e, quando existir, o banco do login
  const users = sql`select user_id as id from ${userProfiles} where lower(email) = ${e}`;
  const run = (u: ReturnType<typeof sql>) => db.execute<{ id: string }>(sql`
    with u as (${u})
    select id::text from (
      select t.id, t.created_at from ${tickets} t where t.holder_user_id in (select id from u)
      union select t.id, t.created_at from ${tickets} t join ${orders} o on o.id = t.order_id where o.user_id in (select id from u) or lower(o.buyer_email) = ${e}
      union select t.id, t.created_at from ${ticketTransfers} tr join ${tickets} t on t.id = tr.ticket_id
        where tr.from_user_id in (select id from u) or tr.to_user_id in (select id from u) or tr.to_email = ${e}
      union select t.id, t.created_at from ${resaleListings} l join ${tickets} t on t.id = l.ticket_id
        where l.seller_user_id in (select id from u) or l.buyer_user_id in (select id from u)
      union select t.id, t.created_at from ${ticketEvents} ev join ${tickets} t on t.id = ev.ticket_id
        where ev.from_user_id in (select id from u) or ev.to_user_id in (select id from u) or ev.to_email = ${e}
    ) x order by created_at desc limit ${MAX}`);
  try {
    return ids(await run(sql`${users} union select id::text from neon_auth."user" where lower(email) = ${e}`));
  } catch {
    return ids(await run(users));
  }
}

type Person = { name: string | null; email: string | null };

/** Nome e e-mail das contas (perfil; o banco do login completa o que faltar). */
async function people(userIds: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  if (!userIds.length) return out;
  const rows = await db.select({ id: schema.userProfiles.userId, name: schema.userProfiles.name, email: schema.userProfiles.email })
    .from(schema.userProfiles).where(inArray(schema.userProfiles.userId, userIds));
  for (const r of rows) out.set(r.id, { name: r.name, email: r.email });
  const missing = userIds.filter((u) => !out.get(u)?.email && /^[0-9a-f-]{36}$/i.test(u));
  if (missing.length) {
    try {
      const r = await db.execute<{ id: string; name: string | null; email: string | null }>(sql`
        select id::text, name, email from neon_auth."user" where id::text in (${sql.join(missing.map((m) => sql`${m}`), sql`, `)})`);
      for (const x of r.rows) out.set(x.id, { name: out.get(x.id)?.name ?? x.name, email: x.email });
    } catch { /* sem acesso ao banco do login: fica o perfil */ }
  }
  return out;
}

/** Ordem de passos no mesmo instante (mesma transação). */
const RANK: Record<TrailKind, number> = {
  emitido: 0, presente: 1, revenda_anunciada: 2, transferencia_enviada: 3, transferencia_reenviada: 4, presente_aceito: 5, transferencia_aceita: 5,
  transferencia_cancelada: 6, revenda_retirada: 7, revenda_vendida: 8, checkin_recusado: 9, checkin: 10, reembolso: 11, cancelado: 11,
};
const OWNER_CHANGE = new Set<TrailKind>(["presente_aceito", "transferencia_aceita", "revenda_vendida"]);
const VIA: Partial<Record<TrailKind, TrailHolder["via"]>> = { presente_aceito: "presente", transferencia_aceita: "transferencia", revenda_vendida: "revenda" };

/** Passo com as contas ainda como id (viram nome/e-mail no fim). */
type Raw = Omit<TrailStep, "who" | "to"> & { whoId?: string | null; whoText?: string | null; whoFallback?: string | null; toId?: string | null; toText?: string | null };

/** Rastro dos ingressos achados pela busca (código atual ou anterior, e-mail ou número do pedido), até 20. */
export async function adminTicketTrail(q: string): Promise<AdminTrail[]> {
  const parsed = parseTrailQuery(q);
  if (!parsed) return [];
  const found = await findTicketIds(parsed);
  if (!found.length) return [];
  const { tickets, ticketEvents, ticketTransfers, resaleListings, orderRefunds, orders } = schema;

  const [ts, evs, trs, lis, rfs] = await Promise.all([
    db.query.tickets.findMany({
      where: inArray(tickets.id, found),
      with: {
        event: { columns: { title: true, slug: true, startAt: true } },
        ticketType: { columns: { name: true, kind: true } },
        order: { columns: { id: true, number: true, userId: true, buyerName: true, buyerEmail: true, resaleListingId: true } },
        orderItem: { columns: { unitPriceCents: true } },
      },
    }),
    db.query.ticketEvents.findMany({ where: inArray(ticketEvents.ticketId, found), orderBy: [asc(ticketEvents.createdAt)] }),
    db.query.ticketTransfers.findMany({ where: inArray(ticketTransfers.ticketId, found) }),
    db.query.resaleListings.findMany({ where: inArray(resaleListings.ticketId, found) }),
    db.select().from(orderRefunds).where(sql`${orderRefunds.status} = 'succeeded' and ${orderRefunds.ticketIds} ?| ${sql`array[${sql.join(found.map((f) => sql`${f}`), sql`, `)}]::text[]`}`),
  ]);
  const orderIds = [...new Set(evs.map((e) => e.orderId).filter((x): x is string => !!x))];
  const evOrders = orderIds.length ? await db.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.id, orderIds)) : [];
  const orderNo = new Map(evOrders.map((o) => [o.id, o.number]));

  const raws = new Map<string, Raw[]>();
  const userIds = new Set<string>();
  const keep = (u: string | null | undefined) => { if (u) userIds.add(u); return u ?? null; };

  for (const t of ts) {
    const mine = evs.filter((e) => e.ticketId === t.id);
    const steps: Raw[] = [];
    const has = new Set(mine.map((e) => `${e.kind}:${e.refId ?? ""}`));
    const hasKind = (k: string) => mine.some((e) => e.kind === k);

    // registrados
    for (const e of mine) {
      const kind = e.kind as TrailKind;
      const base: Raw = { at: e.createdAt, kind, code: e.code, amountCents: e.amountCents };
      const prev = e.prevCode ? `Código anterior: ${e.prevCode}` : null;
      const no = e.orderId ? orderNo.get(e.orderId) : null;
      if (kind === "emitido") steps.push({ ...base, whoId: keep(e.fromUserId), toText: e.holderName ? `Titular: ${e.holderName}` : null, note: no ? `Pedido #${no}` : null });
      else if (kind === "presente") steps.push({ ...base, whoId: keep(e.fromUserId), toText: e.toEmail, note: e.holderName ? `Titular: ${e.holderName}` : null });
      else if (kind === "transferencia_enviada" || kind === "transferencia_reenviada" || kind === "transferencia_cancelada") steps.push({ ...base, whoId: keep(e.fromUserId), toText: e.toEmail, note: e.note });
      else if (kind === "presente_aceito" || kind === "transferencia_aceita") steps.push({ ...base, whoId: keep(e.fromUserId), toId: keep(e.toUserId), toText: e.toEmail, note: prev });
      else if (kind === "revenda_vendida") steps.push({ ...base, whoId: keep(e.fromUserId), toId: keep(e.toUserId), note: [prev, no ? `Pedido #${no}` : null].filter(Boolean).join(" · ") || null });
      else if (kind === "checkin") steps.push({ ...base, whoText: e.note });
      else steps.push({ ...base, whoId: keep(e.fromUserId), note: e.note });
    }

    // montados dos dados antigos (só o que não foi registrado)
    const accepted = trs.filter((x) => x.ticketId === t.id && x.status === "accepted").map((x) => ({ at: x.acceptedAt ?? x.updatedAt, from: x.fromUserId }));
    const sold = lis.filter((l) => l.ticketId === t.id && l.status === "sold").map((l) => ({ at: l.soldAt ?? l.updatedAt, from: l.sellerUserId }));
    const firstOwner = [...accepted, ...sold].sort((a, b) => a.at.getTime() - b.at.getTime())[0]?.from ?? t.holderUserId;
    if (!hasKind("emitido")) {
      // o pedido do ingresso revendido já é o da revenda: o pedido original não fica ligado ao ingresso
      const original = t.order && !t.order.resaleListingId ? t.order : null;
      const p = original ? t.orderItem?.unitPriceCents ?? null : null;
      steps.push({
        at: t.createdAt, kind: "emitido", whoId: keep(original?.userId ?? firstOwner), rebuilt: true,
        // conta antiga sem perfil: o nome e o e-mail do pedido
        whoFallback: original ? [original.buyerName, original.buyerEmail].filter(Boolean).join(" · ") || null : null,
        amountCents: p == null ? null : p - (t.halfPrice ? Math.round(p / 2) : 0), note: original?.number ? `Pedido #${original.number}` : null,
      });
    }
    for (const x of trs.filter((y) => y.ticketId === t.id)) {
      const gift = x.kind === "gift";
      const sent: TrailKind = gift ? "presente" : "transferencia_enviada";
      if (!has.has(`${sent}:${x.id}`)) steps.push({ at: x.createdAt, kind: sent, whoId: keep(x.fromUserId), toText: x.toEmail, rebuilt: true });
      const got: TrailKind = gift ? "presente_aceito" : "transferencia_aceita";
      if (x.status === "accepted" && !has.has(`${got}:${x.id}`)) steps.push({ at: x.acceptedAt ?? x.updatedAt, kind: got, whoId: keep(x.fromUserId), toId: keep(x.toUserId), toText: x.toEmail, rebuilt: true });
      // cancelada pelo remetente fica registrada; cancelada junto com reembolso, revenda ou vencida só aparece aqui
      if ((x.status === "cancelled" || x.status === "expired") && !has.has(`transferencia_cancelada:${x.id}`)) {
        steps.push({ at: x.updatedAt, kind: "transferencia_cancelada", whoId: keep(x.fromUserId), toText: x.toEmail, note: x.status === "expired" ? "Venceu" : null, rebuilt: true });
      }
    }
    for (const l of lis.filter((y) => y.ticketId === t.id)) {
      // anunciar e retirar da revenda não mudam o ingresso: vêm sempre do anúncio
      steps.push({ at: l.createdAt, kind: "revenda_anunciada", whoId: keep(l.sellerUserId), amountCents: l.priceCents });
      if (l.status === "cancelled") steps.push({ at: l.updatedAt, kind: "revenda_retirada", whoId: keep(l.sellerUserId) });
      if (l.status === "sold" && !has.has(`revenda_vendida:${l.id}`)) {
        steps.push({ at: l.soldAt ?? l.updatedAt, kind: "revenda_vendida", whoId: keep(l.sellerUserId), toId: keep(l.buyerUserId), amountCents: l.priceCents, rebuilt: true });
      }
    }
    if (!hasKind("reembolso") && !hasKind("cancelado")) {
      const rows = rfs.filter((r) => (r.ticketIds ?? []).includes(t.id));
      const k: TrailKind = t.status === "cancelled" ? "cancelado" : "reembolso";
      for (const r of rows) steps.push({ at: r.updatedAt, kind: k, whoText: r.actorName, note: r.reason?.slice(0, 200) ?? null, rebuilt: true });
      if (!rows.length && (t.status === "refunded" || t.status === "cancelled")) steps.push({ at: t.updatedAt, kind: k, rebuilt: true });
    }
    if (t.checkedInAt && !hasKind("checkin")) steps.push({ at: t.checkedInAt, kind: "checkin", rebuilt: true });

    steps.sort((a, b) => a.at.getTime() - b.at.getTime() || RANK[a.kind] - RANK[b.kind]);
    raws.set(t.id, steps);
    keep(t.holderUserId);
    keep(firstOwner);
    keep(t.order?.userId);
  }

  const who = await people([...userIds]);
  const label = (id: string | null | undefined, fallback?: string | null) => {
    if (!id) return fallback ?? null;
    const p = who.get(id);
    return p ? [p.name, p.email].filter(Boolean).join(" · ") || fallback || "Conta sem nome" : fallback || "Conta sem perfil";
  };

  return ts
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((t) => {
      const raw = raws.get(t.id) ?? [];
      const steps: TrailStep[] = raw.map(({ whoId, whoText, whoFallback, toId, toText, ...s }) => ({
        ...s, who: whoText ?? label(whoId, whoFallback), to: toId ? (label(toId) ?? toText ?? null) : toText ?? null,
      }));
      // titulares: quem comprou (ou o primeiro dono conhecido) e cada troca de dono, na ordem
      const first = raw.find((s) => s.kind === "emitido")?.whoId ?? t.holderUserId;
      const holders: TrailHolder[] = [{ ...(who.get(first ?? "") ?? { name: null, email: null }), since: t.createdAt, via: "compra" }];
      for (const s of raw) {
        if (!OWNER_CHANGE.has(s.kind) || !s.toId) continue;
        holders.push({ ...(who.get(s.toId) ?? { name: null, email: s.toText ?? null }), since: s.at, via: VIA[s.kind]! });
      }
      const prevCodes = [...new Set([
        ...evs.filter((e) => e.ticketId === t.id).flatMap((e) => [e.prevCode, e.code]),
        ...rfs.filter((r) => (r.ticketIds ?? []).includes(t.id)).map((r) => r.ticketCodes?.[(r.ticketIds ?? []).indexOf(t.id)] ?? null),
      ].filter((c): c is string => !!c && c !== t.code))];
      const cur = who.get(t.holderUserId);
      return {
        id: t.id, code: t.code, prevCodes, status: t.status, type: t.ticketType.name, kind: t.ticketType.kind, half: t.halfPrice,
        event: { title: t.event.title, slug: t.event.slug, startAt: t.event.startAt },
        order: t.order ? { number: t.order.number != null ? String(t.order.number) : null, buyer: t.order.buyerName, email: t.order.buyerEmail } : null,
        holder: { name: t.holderName ?? cur?.name ?? null, email: cur?.email ?? null },
        holders, steps, rebuilt: steps.some((s) => s.rebuilt),
      };
    });
}
