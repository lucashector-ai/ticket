import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { zipSync } from "fflate";
import forge from "node-forge";
import { PASS_IMAGES } from "./images";
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

const sha1 = (bytes: Uint8Array) => {
  const md = forge.md.sha1.create();
  md.update(forge.util.binary.raw.encode(bytes));
  return md.digest().toHex();
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** pass.json no formato eventTicket (preto, título em branco, rótulos em lima). */
function passJson(d: PassData, s: Signer) {
  const iso = (x: Date) => x.toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    formatVersion: 1,
    passTypeIdentifier: s.passTypeId,
    teamIdentifier: s.teamId,
    serialNumber: d.code,
    organizationName: "Tickets Win",
    description: `Ingresso · ${d.title}`,
    logoText: "",
    backgroundColor: "rgb(17,17,17)",
    foregroundColor: "rgb(255,255,255)",
    labelColor: "rgb(211,245,91)",
    relevantDate: iso(d.start),
    expirationDate: iso(new Date(d.end.getTime() + 12 * 3600_000)),
    ...(d.valid ? {} : { voided: true }),
    barcodes: [{ format: "PKBarcodeFormatQR", message: d.qr, messageEncoding: "iso-8859-1", altText: d.code }],
    eventTicket: {
      headerFields: [{ key: "status", label: "INGRESSO", value: d.valid ? "Válido" : d.used ? "Utilizado" : "Inválido" }],
      primaryFields: [{ key: "event", label: "EVENTO", value: d.title }],
      secondaryFields: [
        { key: "date", label: "DATA", value: d.when },
        { key: "venue", label: "LOCAL", value: d.venue || d.city },
      ],
      auxiliaryFields: [
        { key: "type", label: "TIPO", value: d.type },
        ...(d.holder ? [{ key: "holder", label: "TITULAR", value: d.holder }] : []),
        ...(d.doors ? [{ key: "doors", label: "PORTÕES", value: d.doors }] : []),
      ],
      backFields: [
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
  const manifest = JSON.stringify(Object.fromEntries(Object.entries(files).map(([n, b]) => [n, sha1(b)])));
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
