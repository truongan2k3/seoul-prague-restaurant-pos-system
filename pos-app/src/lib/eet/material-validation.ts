import "server-only";
import forge from "node-forge";
import { createPrivateKey, createPublicKey, timingSafeEqual } from "node:crypto";
import { EET_NAMESPACE } from "./policy";
import { assertCertificate, parseXml, sha256, soapActionFromWsdl } from "./xml";
import type { ProtocolMaterial, SignerMaterial, ResponseMaterial } from "./material-store";
import { validateIcaAuthorities } from "./response-chain";

export function validateProtocol(wsdl: string, xsd: string): ProtocolMaterial {
  if (Buffer.byteLength(wsdl) > 64 * 1024 || Buffer.byteLength(xsd) > 64 * 1024 || !wsdl || !xsd) throw new Error("Provide both WSDL and XSD, at most 64 KB each.");
  soapActionFromWsdl(wsdl);
  const schema = parseXml(xsd).documentElement;
  if (!schema || schema.localName !== "schema" || schema.namespaceURI !== "http://www.w3.org/2001/XMLSchema" || schema.getAttribute("targetNamespace") !== EET_NAMESPACE) throw new Error("XSD must describe the EET v4 namespace.");
  return { wsdl, xsd, wsdlSha256: sha256(wsdl), xsdSha256: sha256(xsd) };
}
export function validateSigner(material: SignerMaterial) {
  if (Buffer.byteLength(material.certificate) > 16 * 1024 || Buffer.byteLength(material.privateKey) > 32 * 1024 || (material.passphrase?.length ?? 0) > 1024) throw new Error("Certificate/key input is too large.");
  const certificate = assertCertificate(material.certificate);
  if (certificate.ca) throw new Error("Upload the register leaf certificate, not a CA certificate.");
  const eic = certificate.subject.split("\n").find(s => /^CN=CZ\d{8,10}$/.test(s))?.slice(3);
  if (!eic) throw new Error("The register certificate must contain an EET EIČ.");
  const privateKey = createPrivateKey({ key: material.privateKey, passphrase: material.passphrase });
  const a = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const b = certificate.publicKey.export({ type: "spki", format: "der" });
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Private key does not match the certificate.");
  return { fingerprint: certificate.fingerprint256, expiresAt: new Date(certificate.validTo).toISOString(), eic };
}
export function parsePkcs12(bytes: Uint8Array, password: string): SignerMaterial {
  if (!bytes.length || bytes.length > 128 * 1024 || password.length > 1024) throw new Error("Invalid PKCS#12 file size or password length.");
  // Parse only on the server; require the archive MAC to authenticate the password/integrity.
  const asn1 = forge.asn1.fromDer(Buffer.from(bytes).toString("binary"), true);
  const root = asn1.value;
  if (!Array.isArray(root) || root.length !== 3) throw new Error("PKCS#12 archive must include integrity protection.");
  const archive = forge.pkcs12.pkcs12FromAsn1(asn1, true, password);
  const keys = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].flatMap(type => archive.getBags({ bagType: type })[type] ?? []).flatMap(bag => bag.key ? [bag.key] : []);
  const certificates = (archive.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).flatMap(bag => bag.cert ? [bag.cert] : []);
  if (keys.length !== 1) throw new Error("Upload an archive containing exactly one register private key.");
  const privateKey = forge.pki.privateKeyToPem(keys[0]);
  for (const certificate of certificates) {
    const material = { certificate: forge.pki.certificateToPem(certificate), privateKey };
    try { validateSigner(material); return material; } catch { /* Ignore issuer/unmatched certificate bags. */ }
  }
  throw new Error("No valid matching EET register certificate was found in the archive.");
}
export function validateResponseCertificates(pem: string): ResponseMaterial {
  if (!pem || Buffer.byteLength(pem) > 64 * 1024) throw new Error("Provide response signing leaf certificates (maximum 64 KB).");
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (!certificates.length || certificates.length > 8 || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) throw new Error("Provide PEM response signing certificates only.");
  if (certificates.some(pem => assertCertificate(pem).ca)) return { certificates: validateIcaAuthorities(certificates) };
  for (const pem of certificates) {
    const certificate = assertCertificate(pem);
    if (certificate.ca || certificate.subject.split("\n").some(s => /^CN=CZ\d{8,10}$/.test(s))) throw new Error("Response pins must be tax-authority signing leaf certificates, not taxpayer certificates or root CAs.");
  }
  return { certificates };
}
