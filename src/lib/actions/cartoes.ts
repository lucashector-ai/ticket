"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { cardsOf, listCustomerCards, ownCard, storedCustomerId, type SavedCard } from "@/lib/payments/cards";
import { stripe, stripeEnabled } from "@/lib/payments/stripe";

/*
 * Cartões salvos da conta (checkout e Minha conta › Pagamentos). Tudo pelo cliente gravado no perfil de quem
 * está logado; o navegador só manda o id do cartão, e o servidor confere que ele é desta conta.
 */

const pmId = z.string().regex(/^pm_[A-Za-z0-9]{6,64}$/);
const FAIL = "Não conseguimos falar com o processador de pagamentos agora. Tente de novo em instantes.";

/** Cartões salvos para escolher no checkout. */
export async function myCards(): Promise<{ ok: true; cards: SavedCard[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!stripeEnabled()) return { ok: true, cards: [] };
  try {
    return { ok: true, cards: await cardsOf(user.id) };
  } catch (e) {
    console.error("myCards", (e as Error).message);
    return { ok: false, error: FAIL };
  }
}

/** Remove um cartão salvo (e cópias do mesmo cartão salvas antes). */
export async function removeCard(paymentMethodId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!stripeEnabled() || !pmId.safeParse(paymentMethodId).success) return { ok: false, error: "Cartão não encontrado." };
  try {
    const own = await ownCard(user.id, paymentMethodId);
    if (!own) return { ok: false, error: "Cartão não encontrado." };
    const fp = own.pm.card?.fingerprint ?? null;
    const { all } = await listCustomerCards(own.customerId);
    const ids = new Set([paymentMethodId, ...(fp ? all.filter((pm) => pm.card?.fingerprint === fp).map((pm) => pm.id) : [])]);
    for (const id of ids) await stripe().paymentMethods.detach(id);
    revalidatePath("/conta/pagamentos");
    return { ok: true };
  } catch (e) {
    console.error("removeCard", (e as Error).message);
    return { ok: false, error: FAIL };
  }
}

/** Marca um cartão salvo como o principal (vem escolhido no checkout). */
export async function setDefaultCard(paymentMethodId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!stripeEnabled() || !pmId.safeParse(paymentMethodId).success) return { ok: false, error: "Cartão não encontrado." };
  try {
    const own = await ownCard(user.id, paymentMethodId);
    if (!own || own.customerId !== (await storedCustomerId(user.id))) return { ok: false, error: "Cartão não encontrado." };
    await stripe().customers.update(own.customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    revalidatePath("/conta/pagamentos");
    return { ok: true };
  } catch (e) {
    console.error("setDefaultCard", (e as Error).message);
    return { ok: false, error: FAIL };
  }
}
