import "server-only";
import { sql } from "drizzle-orm";
import { schema } from "@/db";

/*
 * Limite de usos do cupom (max_uses), como o estoque: o pedido pendente dentro dos 15 min da reserva segura um
 * uso, e a confirmação conta o uso de verdade. Antes, o limite só era conferido ao criar o pedido (uses < max_uses)
 * e a emissão somava sem conferir: com o último uso livre, todos os pedidos abertos ao mesmo tempo (ou em
 * sequência, antes do primeiro pagar) levavam o desconto.
 */

const { coupons: c, orders: o } = schema;

/** Trava por cupom (um pedido de cada vez passa pela conferência de usos daquele cupom). */
export const couponLockKey = (couponId: string) => `cupom:${couponId}`;

/**
 * Condição SQL (para um `ensure` na transação do pedido): usos já confirmados + pedidos pendentes dentro da reserva
 * com este cupom (o que acabou de ser gravado incluído) cabem no limite. Sem limite, sempre passa.
 */
export const couponHeldOkSql = (couponId: string) => sql`not exists (
  select 1 from ${c} k
  where k.id = ${couponId} and k.max_uses is not null
    and k.uses + (
      select count(*) from ${o} p where p.coupon_id = k.id and p.status = 'pending' and p.expires_at > now()
    ) > k.max_uses
)`;

/** Condição SQL (para um `ensure` na emissão, depois de somar o uso): o cupom não passou do limite. */
export const couponPaidOkSql = (couponId: string) => sql`not exists (
  select 1 from ${c} k where k.id = ${couponId} and k.max_uses is not null and k.uses > k.max_uses
)`;
