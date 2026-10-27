import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { mailLayout, sendEmails } from "@/lib/email";
import { brl } from "@/lib/format";

/** O vendedor recebe o valor anunciado menos esta taxa (a do comprador é a taxa de serviço normal). */
export const RESALE_SELLER_FEE = 0.05;
export const sellerNet = (priceCents: number) => Math.round(priceCents * (1 - RESALE_SELLER_FEE));

/** Avisa o vendedor (se tivermos o e-mail dele) que o ingresso foi revendido. */
export async function notifyResaleSold(sellerUserId: string, eventTitle: string, priceCents: number) {
  const prof = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, sellerUserId), columns: { email: true } });
  if (!prof?.email) return;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await sendEmails([{
    to: prof.email,
    subject: `Seu ingresso de ${eventTitle} foi vendido`,
    ...mailLayout({
      preheader: "Revenda concluída.",
      title: "Seu ingresso foi vendido",
      paragraphs: [`Alguém comprou o seu ingresso de ${eventTitle} na revenda oficial. O QR code antigo deixou de valer.`, `Você recebe ${brl(sellerNet(priceCents))} (valor anunciado menos 5% da revenda).`],
      cta: { label: "Ver meus ingressos", url: `${site}/meus-ingressos` },
    }),
  }]).catch((e) => console.error("resale mail", e));
}
