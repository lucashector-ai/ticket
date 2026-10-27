import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { zipSync } from "fflate";
import forge from "node-forge";
import { PASS_IMAGES } from "./images";
import { passStrip } from "./strip";
import type { PassData } from "./pass-data";

/*
 * Passe da Apple Wallet (.pkpass): pass.json + imagens + manifest.json (SHA-1 de cada arquivo)
 * + signature (PKCS#7 destacado do manifest, assinado com o certificado do Pass Type ID).
 *
 * Segredos no Cloudflare:
 *   APPLE_PASS_P12           certificado do Pass Type ID exportado do Keychain (.p12), em base64
 *   APPLE_PASS_P12_PASSWORD  senha usada na exportação
 * O Pass Type ID e o Team ID são lidos do próprio certificado. O certificado intermediário da
 * Apple (WWDR G4) é público: baixamos de apple.com e guardamos no KV.
 */

const WWDR_URL = "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer";
const OID_UID = "0.9.2342.19200300.100.1.1";

export const appleWalletEnabled = () => !!process.env.APPLE_PASS_P12;

type Signer = { cert: forge.pki.Certificate; key: forge.pki.PrivateKey; passTypeId: string; teamId: string };
let signer: Signer | null = null;

function loadSigner(): Signer {
  if (signer) return signer;
  const b64 = (process.env.APPLE_PASS_P12 ?? "").replace(/\s+/g, "");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(b64)), false, process.env.APPLE_PASS_P12_PASSWORD ?? "");
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const key = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0])?.key;
  if (!cert || !key) throw new Error("O .p12 precisa ter o certificado e a chave privada.");
  const passTypeId = String(cert.subject.getField({ type: OID_UID })?.value ?? "");
  const teamId = String(cert.subject.getField("OU")?.value ?? "");
  if (!passTypeId.startsWith("pass.") || !teamId) throw new Error("Esse certificado não é de um Pass Type ID.");
  signer = { cert, key, passTypeId, teamId };
  return signer;
}

async function wwdr(): Promise<forge.pki.Certificate> {
  // opcional: o PEM do WWDR G4 numa variável, se o download da Apple não estiver disponível
  if (process.env.APPLE_WWDR_PEM) return forge.pki.certificateFromPem(process.env.APPLE_WWDR_PEM);
  const { env } = await getCloudflareContext({ async: true });
  let der = await env.KV.get("wallet:wwdr-g4");
  if (!der) {
    const r = await fetch(WWDR_URL);
    if (!r.ok) throw new Error("Não foi possível baixar o certificado da Apple (WWDR).");
    der = forge.util.binary.raw.encode(new Uint8Array(await r.arrayBuffer()));
    await env.KV.put("wallet:wwdr-g4", forge.util.encode64(der), { expirationTtl: 60 * 60 * 24 * 30 });
  } else {
    der = forge.util.decode64(der);
  }
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
}

/** SHA-1 em hex pelo WebCrypto (o do node-forge estoura a pilha com imagens grandes). */
const sha1 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-1", bytes as BufferSource))].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

type RGB = [number, number, number];
const LIME: RGB = [211, 245, 91];
const rgb = (c: RGB) => `rgb(${c.join(",")})`;

/** Cores do passe a partir da cor do evento: cor escura vira o fundo; cor clara vira os rótulos. */
export function passColors(accent: string | null): { bg: RGB; label: RGB; accent: RGB } {
  const dark: RGB = [17, 17, 17];
  if (!accent) return { bg: dark, label: LIME, accent: LIME };
  const c = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)) as RGB;
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return lum < 0.22 ? { bg: c, label: LIME, accent: LIME } : { bg: dark, label: c, accent: c };
}

/** pass.json no formato eventTicket: capa do evento na faixa, nome por cima, dados do ingresso abaixo. */
function passJson(d: PassData, s: Signer) {
  const col = passColors(d.accent);
  const iso = (x: Date) => x.toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    formatVersion: 1,
    passTypeIdentifier: s.passTypeId,
    teamIdentifier: s.teamId,
    serialNumber: d.code,
    organizationName: "Tickets Win",
    description: `Ingresso · ${d.title}`,
    logoText: "",
    backgroundColor: rgb(col.bg),
    foregroundColor: "rgb(255,255,255)",
    labelColor: rgb(col.label),
    relevantDate: iso(d.windows[0]?.from ?? d.start),
    // iOS 18+: todas as janelas em que o ingresso deve aparecer sozinho (tela de bloqueio, toque duplo)
    ...(d.windows.length ? { relevantDates: d.windows.map((w) => ({ startDate: iso(w.from), endDate: iso(w.to) })) } : {}),
    ...(d.geo ? { locations: [{ latitude: d.geo.lat, longitude: d.geo.lng, relevantText: `Você chegou ao ${d.venue || "evento"}. Seu ingresso está aqui.` }], maxDistance: 800 } : {}),
    semantics: {
      eventName: d.title,
      eventType: "PKEventTypeLivePerformance",
      eventStartDate: iso(d.start),
      eventEndDate: iso(d.end),
      ...(d.venue ? { venueName: d.venue } : {}),
      ...(d.city ? { venueRegionName: d.uf ? `${d.city} – ${d.uf}` : d.city } : {}),
      ...(d.holder ? { attendeeName: d.holder } : {}),
      admissionLevel: d.type,
      ...(d.geo ? { venueLocation: { latitude: d.geo.lat, longitude: d.geo.lng } } : {}),
      ...(d.performers.length ? { performerNames: d.performers } : {}),
    },
    expirationDate: iso(new Date(d.end.getTime() + 12 * 3600_000)),
    ...(d.valid ? {} : { voided: true }),
    barcodes: [{ format: "PKBarcodeFormatQR", message: d.qr, messageEncoding: "iso-8859-1", altText: d.code }],
    eventTicket: {
      headerFields: [{ key: "date", label: "DATA", value: d.whenShort, textAlignment: "PKTextAlignmentRight" }],
      primaryFields: [{ key: "event", label: d.city ? d.city.toUpperCase() : "EVENTO", value: d.title }],
      secondaryFields: [
        { key: "venue", label: "LOCAL", value: d.venue || d.city },
        { key: "type", label: "SETOR", value: d.type, textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: [
        { key: "holder", label: "TITULAR", value: d.holder || "—" },
        { key: "status", label: "INGRESSO", value: d.valid ? "Válido" : d.used ? "Utilizado" : "Inválido", textAlignment: "PKTextAlignmentRight" },
      ],
      backFields: [
        { key: "when", label: "Data e horário", value: [d.when, d.doors || d.whenShort.split(" · ")[1]].filter(Boolean).join(" · ") },
        { key: "code", label: "Código do ingresso", value: d.code },
        ...(d.address ? [{ key: "address", label: "Endereço", value: d.address }] : []),
        { key: "link", label: "Seu ingresso no site", value: d.url, attributedValue: `<a href="${d.url}">Abrir no Tickets Win</a>` },
        { key: "rules", label: "Importante", value: "Apresente o QR code na entrada com um documento com foto. Meia-entrada exige comprovante. Se o ingresso for transferido, este passe deixa de valer." },
      ],
    },
  };
}

/** Gera o .pkpass assinado. */
export async function buildPkpass(d: PassData): Promise<Uint8Array> {
  const s = loadSigner();
  const files: Record<string, Uint8Array> = { "pass.json": new TextEncoder().encode(JSON.stringify(passJson(d, s))) };
  for (const [name, b64] of Object.entries(PASS_IMAGES)) files[name] = fromB64(b64);
  const col = passColors(d.accent);
  Object.assign(files, (await passStrip(d.banner, new URL(d.url).origin, col.bg, col.accent)) ?? {});
  const manifest = JSON.stringify(Object.fromEntries(await Promise.all(Object.entries(files).map(async ([n, b]) => [n, await sha1(b)]))));
  files["manifest.json"] = new TextEncoder().encode(manifest);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest, "utf8");
  p7.addCertificate(s.cert);
  p7.addCertificate(await wwdr());
  p7.addSigner({
    key: s.key as forge.pki.rsa.PrivateKey,
    certificate: s.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  files.signature = forge.util.binary.raw.decode(forge.asn1.toDer(p7.toAsn1()).getBytes());
  return zipSync(files, { level: 6 });
}
