import "server-only";
import { X509Certificate, verify } from "node:crypto";
import forge from "node-forge";
import { certificateCrlUrls } from "./response-chain";

const algorithms: Record<string, string> = { "1.2.840.113549.1.1.11": "RSA-SHA256", "1.2.840.113549.1.1.12": "RSA-SHA384", "1.2.840.113549.1.1.13": "RSA-SHA512" };
const der = (node: forge.asn1.Asn1) => Buffer.from(forge.asn1.toDer(node).getBytes(), "binary");
const children = (node: forge.asn1.Asn1) => { if (!Array.isArray(node.value)) throw new Error("Invalid CRL structure."); return node.value; };
const serial = (value: string) => value.replace(/^0+/, "").toLowerCase() || "0";
function time(node: forge.asn1.Asn1) {
  if (typeof node.value !== "string") throw new Error("Invalid CRL time.");
  const date = node.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(node.value) : node.type === forge.asn1.Type.GENERALIZEDTIME ? forge.asn1.generalizedTimeToDate(node.value) : new Date(NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid CRL time.");
  return date.getTime();
}
export function verifyCertificateRevocation(bytes: Uint8Array, certificate: X509Certificate, issuer: X509Certificate, now = Date.now()) {
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error("Invalid CRL size.");
  const all = children(forge.asn1.fromDer(Buffer.from(bytes).toString("binary"), true));
  if (all.length !== 3) throw new Error("Invalid CRL structure.");
  const [tbs, algorithm, signature] = all;
  const oid = children(algorithm)[0];
  if (typeof oid.value !== "string") throw new Error("Invalid CRL algorithm.");
  const name = algorithms[forge.asn1.derToOid(oid.value)];
  if (!name || typeof signature.value !== "string" || signature.value.charCodeAt(0) !== 0 || !verify(name, der(tbs), issuer.publicKey, Buffer.from(signature.value.slice(1), "binary"))) throw new Error("CRL signature could not be verified.");
  const parsedIssuer = forge.pki.certificateFromPem(issuer.toString());
  const keyUsage = parsedIssuer.getExtension("keyUsage") as { cRLSign?: boolean } | null;
  if (!keyUsage?.cRLSign || !certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey)) throw new Error("Invalid CRL issuer.");
  const fields = children(tbs);
  let i = fields[0].type === forge.asn1.Type.INTEGER ? 1 : 0;
  if (!der(fields[i++]).equals(der(algorithm)) || !der(fields[i++]).equals(der(forge.pki.distinguishedNameToAsn1(parsedIssuer.subject)))) throw new Error("CRL issuer/algorithm mismatch.");
  const thisUpdate = time(fields[i++]), nextUpdate = time(fields[i++]);
  if (thisUpdate > now || nextUpdate <= now || nextUpdate <= thisUpdate) throw new Error("CRL is stale or not yet valid.");
  if (fields[i]?.tagClass === forge.asn1.Class.UNIVERSAL && fields[i]?.type === forge.asn1.Type.SEQUENCE) {
    for (const entry of children(fields[i++])) {
      const values = children(entry), value = values[0];
      if (value.type !== forge.asn1.Type.INTEGER || typeof value.value !== "string" || values.length < 2) throw new Error("Invalid revoked certificate entry.");
      if (serial(Buffer.from(value.value, "binary").toString("hex")) === serial(certificate.serialNumber)) throw new Error("Response certificate has been revoked.");
      if (values.length > 2) for (const extension of children(values[2])) {
        const parts = children(extension), id = parts[0];
        if (typeof id.value !== "string" || forge.asn1.derToOid(id.value) === "2.5.29.29" || (parts[1]?.type === forge.asn1.Type.BOOLEAN && parts[1].value !== "\x00")) throw new Error("Unsupported indirect or critical CRL entry extension.");
      }
    }
  }
  if (fields[i]) {
    if (fields[i].tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || fields[i].type !== 0) throw new Error("Invalid CRL extensions.");
    for (const extension of children(children(fields[i++])[0])) {
      const values = children(extension), id = values[0];
      if (typeof id.value !== "string") throw new Error("Invalid CRL extension.");
      const extensionOid = forge.asn1.derToOid(id.value);
      if (["2.5.29.27", "2.5.29.28"].includes(extensionOid) || (values[1]?.type === forge.asn1.Type.BOOLEAN && values[1].value !== "\x00")) throw new Error("Delta, indirect or critical CRL extensions are unsupported.");
    }
  }
  if (i !== fields.length) throw new Error("Unexpected CRL fields.");
  return nextUpdate;
}

const cache = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
export async function checkCertificateRevocation(certificate: X509Certificate, issuer: X509Certificate) {
  for (const url of certificateCrlUrls(certificate)) {
    const key = `${issuer.fingerprint256}:${url}`;
    try {
      let cached = cache.get(key);
      if (!cached || cached.expiresAt <= Date.now()) {
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3000), cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("CRL unavailable.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4 * 1024 * 1024) throw new Error("CRL is too large."); chunks.push(part.value); } }
        finally { await reader.cancel(); }
        const bytes = Buffer.concat(chunks);
        const expiresAt = Math.min(verifyCertificateRevocation(bytes, certificate, issuer), Date.now() + 15 * 60_000);
        cached = { bytes, expiresAt };
        if (cache.size >= 8) cache.delete(cache.keys().next().value!);
        cache.set(key, cached);
      }
      verifyCertificateRevocation(cached.bytes, certificate, issuer);
      return;
    } catch { cache.delete(key); }
  }
  throw new Error("Current signed I.CA revocation data could not be verified. Reporting remains pending.");
}
