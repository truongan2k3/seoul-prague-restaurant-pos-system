import { X509Certificate } from "node:crypto";
import forge from "node-forge";
import { EET_RESPONSE_AUTHORITIES } from "./response-authorities";
import { assertCertificate } from "./xml";

export function validateIcaAuthorities(certificates: string[]) {
  if (certificates.length !== 2) throw new Error("Import both official I.CA Root RSA 05/2022 and Public RSA 06/2022 certificates.");
  const parsed = certificates.map(pem => ({ pem, certificate: assertCertificate(pem) }));
  const ordered = EET_RESPONSE_AUTHORITIES.map(authority => {
    const item = parsed.find(value => value.certificate.fingerprint256.replaceAll(":", "").toLowerCase() === authority.sha256);
    if (!item || !item.certificate.ca) throw new Error("I.CA authority fingerprint does not match the independently published certificate.");
    return item;
  });
  if (!ordered[0].certificate.verify(ordered[0].certificate.publicKey) || !ordered[1].certificate.checkIssued(ordered[0].certificate) || !ordered[1].certificate.verify(ordered[0].certificate.publicKey)) throw new Error("Invalid I.CA authority chain.");
  return ordered.map(item => item.pem);
}

/** General cryptographic path checks. Production callers must pin the authorities first. */
export function verifyResponseCertificateChain(leafPem: string, rootPem: string, issuerPem: string, now = new Date()) {
  const leaf = assertCertificate(leafPem, undefined, now), root = assertCertificate(rootPem, undefined, now), issuer = assertCertificate(issuerPem, undefined, now);
  if (leaf.ca || !root.ca || !issuer.ca || !root.verify(root.publicKey) || !issuer.checkIssued(root) || !issuer.verify(root.publicKey) || !leaf.checkIssued(issuer) || !leaf.verify(issuer.publicKey)) throw new Error("Response signer does not chain to the trusted authority.");
  const parsed = [leafPem, issuerPem].map(pem => forge.pki.certificateFromPem(pem));
  const usage = parsed[0].getExtension("keyUsage") as { digitalSignature?: boolean } | null;
  if (!usage?.digitalSignature) throw new Error("Response certificate is not authorized for digital signatures.");
  forge.pki.verifyCertificateChain(forge.pki.createCaStore([rootPem]), parsed, { validityCheckDate: now });
  return leaf;
}

export function certificateCrlUrls(certificate: X509Certificate) {
  const parsed = forge.pki.certificateFromPem(certificate.toString());
  const extension = parsed.getExtension("cRLDistributionPoints") as { value?: string } | null;
  if (!extension?.value) throw new Error("Signer revocation distribution points are missing.");
  const urls: string[] = [];
  const visit = (node: forge.asn1.Asn1) => {
    if (node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === 6 && typeof node.value === "string") {
      const url = new URL(node.value);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.endsWith(".ica.cz") || url.username || url.password || url.port || url.search || url.hash || !url.pathname.endsWith(".crl")) throw new Error("Unapproved I.CA revocation URL.");
      urls.push(url.href);
    }
    if (Array.isArray(node.value)) node.value.forEach(visit);
  };
  visit(forge.asn1.fromDer(extension.value, true));
  if (!urls.length || urls.length > 4) throw new Error("Invalid I.CA revocation distribution points.");
  return [...new Set(urls)];
}
