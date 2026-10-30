import { createVerify } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";

/*
 * Mesma assinatura PKCS#7 destacada do passe da Apple Wallet (src/lib/wallet/apple.ts), com um certificado
 * gerado aqui: protege a atualização do node-forge (a Apple recusa o passe se a assinatura vier errada).
 */
describe("assinatura do passe da Apple Wallet (node-forge)", () => {
  it("gera PKCS#7 destacado com SHA-256 que confere com a chave do certificado", () => {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 864e5);
    cert.validity.notAfter = new Date(Date.now() + 864e5);
    const attrs = [{ name: "commonName", value: "Teste Tickets Win" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const manifest = JSON.stringify({ "pass.json": "da39a3ee5e6b4b0d3255bfef95601890afd80709" });
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifest, "utf8");
    p7.addCertificate(cert);
    p7.addSigner({
      key: keys.privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
      ],
    });
    p7.sign({ detached: true });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    expect(der.length).toBeGreaterThan(500);

    // relê o PKCS#7 e confere a assinatura dos atributos com a chave pública (como a Apple faz)
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData & { rawCapture: { signature: string; authenticatedAttributes: forge.asn1.Asn1[] } };
    const signed = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, msg.rawCapture.authenticatedAttributes);
    const v = createVerify("sha256");
    v.update(Buffer.from(forge.asn1.toDer(signed).getBytes(), "binary"));
    expect(v.verify(forge.pki.certificateToPem(cert), Buffer.from(msg.rawCapture.signature, "binary"))).toBe(true);
  });
});
