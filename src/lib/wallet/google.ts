import "server-only";
import { PASS_THEME, toHex } from "./theme";
import type { PassData } from "./pass-data";

/*
 * Google Wallet: link "pay.google.com/gp/v/save/<JWT>". O JWT, assinado pela conta de serviço,
 * já traz a classe (o evento) e o objeto (o ingresso); o Google cria os dois ao salvar.
 *
 * Segredos no Cloudflare:
 *   GOOGLE_WALLET_ISSUER_ID        Issuer ID do Google Pay & Wallet Console
 *   GOOGLE_WALLET_SERVICE_ACCOUNT  conteúdo inteiro do JSON da chave da conta de serviço
 */

export const googleWalletEnabled = () => !!(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SERVICE_ACCOUNT);

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
/** Ids do Google: só letras, números, ponto, _ e -. */
const gid = (s: string) => s.replace(/[^\w.-]/g, "_");
const txt = (value: string) => ({ defaultValue: { language: "pt-BR", value } });

async function signRS256(payload: object, pem: string) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

/** Link para salvar o ingresso no Google Wallet. */
export async function googleSaveUrl(d: PassData, site: string) {
  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const sa = JSON.parse(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT!) as { client_email: string; private_key: string };
  const classId = `${issuer}.${gid(`evento-${d.eventId}`)}`;
  const eventClass = {
    id: classId,
    issuerName: "Tickets Win",
    reviewStatus: "UNDER_REVIEW",
    eventName: txt(d.title),
    logo: { sourceUri: { uri: `${site}/wallet/google-logo.png` }, contentDescription: txt("Tickets Win") },
    hexBackgroundColor: toHex(PASS_THEME.bg),
    ...(d.art ? { heroImage: { sourceUri: { uri: d.art }, contentDescription: txt(d.title) } } : {}),
    ...(d.venue || d.address ? { venue: { name: txt(d.venue || d.city), address: txt(d.address || d.city) } } : {}),
    dateTime: { start: d.start.toISOString(), end: d.end.toISOString() },
    homepageUri: { uri: d.url, description: "Abrir no Tickets Win" },
  };
  const object = {
    id: `${issuer}.${gid(`ingresso-${d.code}`)}`,
    classId,
    state: d.valid ? "ACTIVE" : "INACTIVE",
    barcode: { type: "QR_CODE", value: d.qr, alternateText: d.code },
    ticketNumber: d.code,
    ...(d.holder ? { ticketHolderName: d.holder } : {}),
    ticketType: txt(d.type),
    textModulesData: [
      { id: "data", header: "Data", body: d.when },
      ...(d.doors ? [{ id: "portoes", header: "Portões", body: d.doors }] : []),
    ],
    linksModuleData: { uris: [{ uri: d.url, description: "Seu ingresso no Tickets Win", id: "site" }] },
  };
  const jwt = await signRS256({
    iss: sa.client_email, aud: "google", typ: "savetowallet", iat: Math.floor(Date.now() / 1000),
    origins: [site],
    payload: { eventTicketClasses: [eventClass], eventTicketObjects: [object] },
  }, sa.private_key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
