/* Contato do suporte: canais e assuntos do formulário (usado na página e na ação). */
import { SUPPORT } from "@/lib/site";

export const HELP_EMAIL = SUPPORT.email;

export const CONTACT_SUBJECTS = {
  pagamento: "Compra e pagamento",
  ingressos: "Meus ingressos e QR code",
  reembolso: "Reembolso ou cancelamento",
  transferencia: "Transferência ou revenda",
  conta: "Conta e acesso",
  produtor: "Sou produtor",
  outro: "Outro assunto",
} as const;

export type ContactSubject = keyof typeof CONTACT_SUBJECTS;

export const isSubject = (v: unknown): v is ContactSubject => typeof v === "string" && Object.hasOwn(CONTACT_SUBJECTS, v);

export const WHATSAPP_DISPLAY = SUPPORT.whatsapp;
export const whatsappUrl = (text = "Oi! Vim pela central de ajuda da Tickets Win e preciso de ajuda com ") =>
  `${SUPPORT.whatsappUrl}?text=${encodeURIComponent(text)}`;
