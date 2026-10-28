import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { sendByToken, unsubscribe } from "@/lib/mail/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Descadastrar", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> };

/** Página do link "Descadastre-se" dos e-mails dos produtores. Pede confirmação (leitores de link não descadastram sozinhos). */
export default async function SairPage({ params, searchParams }: Props) {
  const [{ token }, { ok }] = await Promise.all([params, searchParams]);
  const r = await sendByToken(token);

  async function confirm(form: FormData) {
    "use server";
    await unsubscribe(token, form.get("all") === "on");
    redirect(`/e/sair/${token}?ok=${form.get("all") === "on" ? "todos" : "1"}`);
  }

  return (
    <main className="pg-sair">
      <div className="sr-card">
        <Link href="/" className="sr-logo" aria-label="Tickets Win"><BrandLogo height={22} /></Link>
        {token === "teste" ? (
          <><h1>Este é um e-mail de teste</h1><p>O link de descadastro funciona nos e-mails enviados de verdade para o público.</p></>
        ) : !r ? (
          <><h1>Link inválido</h1><p>Não encontramos este e-mail. Se quiser parar de receber mensagens, responda ao e-mail pedindo o descadastro.</p></>
        ) : ok || r.unsubscribedAt ? (
          <><h1>Pronto, você saiu da lista</h1><p>{ok === "todos" ? "Você não vai mais receber e-mails de produtores pela Tickets Win." : <>Você não vai mais receber e-mails de <b>{r.sender}</b> em <b>{r.email}</b>.</>}</p><p className="sr-s">Os e-mails dos seus ingressos (compra, transferência, avisos do evento) continuam chegando normalmente.</p></>
        ) : (
          <form action={confirm}>
            <h1>Parar de receber e-mails de {r.sender}?</h1>
            <p>O endereço <b>{r.email}</b> sai da lista deste produtor.</p>
            <label className="sr-all"><input type="checkbox" name="all" /> Também não quero receber de nenhum outro produtor da Tickets Win</label>
            <button type="submit">Descadastrar</button>
            <p className="sr-s">Os e-mails dos seus ingressos continuam chegando normalmente.</p>
          </form>
        )}
      </div>
    </main>
  );
}
