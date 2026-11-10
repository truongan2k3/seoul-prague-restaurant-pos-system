import "server-only";
import { X509Certificate } from "node:crypto";
import { validateIcaAuthorities, verifyResponseCertificateChain } from "./response-chain";
import { checkCertificateRevocation } from "./response-revocation";
import { DS_NS, SOAP_NS, WSSE_NS, WSU_NS, oneElement, parseXml } from "./xml";
import { EET_NAMESPACE } from "./policy";

/** Resolve a signer only from the authenticated EET transport response. The CA
 * certificates themselves are never used as acknowledgment signing keys. */
export async function responseVerificationCertificates(xml: string, trustedCertificates: string[]) {
  const doc = parseXml(xml);
  const body = oneElement(doc, SOAP_NS, "Body");
  if (!body.getElementsByTagNameNS(EET_NAMESPACE, "Potvrzeni").length) return trustedCertificates;
  if (!trustedCertificates.some(pem => new X509Certificate(pem).ca)) return trustedCertificates; // Existing explicitly pinned leaf mode.
  const [rootPem, issuerPem] = validateIcaAuthorities(trustedCertificates);
  const security = oneElement(doc, WSSE_NS, "Security");
  const signature = oneElement(security, DS_NS, "Signature");
  const token = oneElement(security, WSSE_NS, "BinarySecurityToken");
  const references = oneElement(signature, DS_NS, "KeyInfo").getElementsByTagNameNS(WSSE_NS, "Reference");
  const tokenId = token.getAttributeNS(WSU_NS, "Id");
  if (!tokenId || references.length !== 1 || references.item(0)!.getAttribute("URI") !== `#${tokenId}` || !token.getAttribute("ValueType")?.endsWith("#X509v3") || !token.getAttribute("EncodingType")?.endsWith("#Base64Binary")) throw new Error("Invalid response signer reference.");
  // Reject duplicate IDs before binding the signature to a token.
  const elements = doc.getElementsByTagName("*");
  let idCount = 0;
  for (let i = 0; i < elements.length; i++) if (elements.item(i)!.getAttributeNS(WSU_NS, "Id") === tokenId || elements.item(i)!.getAttribute("Id") === tokenId) idCount++;
  if (idCount !== 1) throw new Error("Ambiguous response signer token.");
  const encoded = (token.textContent ?? "").replace(/\s/g, "");
  if (!encoded || encoded.length > 24 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid response signing certificate.");
  const leafPem = new X509Certificate(Buffer.from(encoded, "base64")).toString();
  const leaf = verifyResponseCertificateChain(leafPem, rootPem, issuerPem);
  const issuer = new X509Certificate(issuerPem), root = new X509Certificate(rootPem);
  await Promise.all([checkCertificateRevocation(leaf, issuer), checkCertificateRevocation(issuer, root)]);
  return [leafPem];
}
