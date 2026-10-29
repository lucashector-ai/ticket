import "server-only";

/*
 * Código de verificação pelo WhatsApp (API oficial da Meta, WhatsApp Cloud API).
 * Liga quando existem WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e WHATSAPP_TEMPLATE (modelo de autenticação aprovado, pt_BR).
 */

export function whatsappEnabled() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE);
}

/** Celular brasileiro (DDD + número) no formato internacional, só dígitos: 5511987654321. */
export function waNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (/^55[1-9]\d{9,10}$/.test(d)) return d;
  if (/^[1-9]\d{9,10}$/.test(d)) return `55${d}`;
  return null;
}

/** Envia o código pelo modelo de autenticação (corpo com o código + botão "copiar código"). */
export async function sendWhatsappCode(phone: string, code: string): Promise<boolean> {
  const to = waNumber(phone);
  if (!whatsappEnabled() || !to) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to, type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_LANG || "pt_BR" },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    if (!r.ok) console.error("whatsapp", r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error("whatsapp", e);
    return false;
  }
}
