import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { X509Certificate, createHash, createPrivateKey, createPublicKey, timingSafeEqual } from "node:crypto";
import { EET_NAMESPACE, validateData } from "./policy";
import type { EetData, EetEnvironment, EetResult } from "./types";

export const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
export const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
export const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
export const EXCLUSIVE = "http://www.w3.org/2001/10/xml-exc-c14n#";
export const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
export const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const TOKEN_TYPE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
const ENCODING = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

export function parseXml(xml: string): Document {
  if (Buffer.byteLength(xml, "utf8") > 64 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsafe or oversized EET XML.");
  return new DOMParser({ onError: () => { throw new Error("Malformed EET XML."); } }).parseFromString(xml, "text/xml");
}

export function oneElement(doc: Document | Element, namespace: string, name: string): Element {
  const matches = doc.getElementsByTagNameNS(namespace, name);
  if (matches.length !== 1) throw new Error(`Unexpected EET ${name} structure.`);
  return matches.item(0)!;
}
function directChildren(node: Element) {
  return Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1);
}
function escapeXml(text: string) { return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!); }
export function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

export function assertCertificate(pem: string, expectedEic?: string, now = new Date()) {
  const certificate = new X509Certificate(pem);
  if (now < new Date(certificate.validFrom) || now >= new Date(certificate.validTo)) throw new Error("EET certificate is not currently valid.");
  if (certificate.publicKey.asymmetricKeyType !== "rsa" || (certificate.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("EET requires an RSA certificate of at least 2048 bits.");
  if (expectedEic && !certificate.subject.split(/\n/).includes(`CN=${expectedEic}`)) throw new Error("EET certificate EIČ does not match the fiscal identity.");
  return certificate;
}

export function signSaleXml(input: { data: EetData; messageId: string; sentAt: string; first: boolean; verification?: boolean; certificate: string; privateKey: string; passphrase?: string }) {
  validateData(input.data);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.messageId)) throw new Error("Invalid message UUID.");
  if (!Number.isFinite(Date.parse(input.sentAt))) throw new Error("Invalid submission timestamp.");
  const cert = assertCertificate(input.certificate, input.data.eic_popl);
  const privateKey = createPrivateKey({ key: input.privateKey, passphrase: input.passphrase });
  const a = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const b = cert.publicKey.export({ type: "spki", format: "der" });
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("EET private key does not match the certificate.");
  const attrs = Object.entries(input.data).map(([key, value]) => `${key}="${escapeXml(value)}"`).join(" ");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${SOAP_NS}" xmlns:tns="${EET_NAMESPACE}" xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}"><soap:Header><wsse:Security soap:mustUnderstand="1"><wsse:BinarySecurityToken wsu:Id="cert" EncodingType="${ENCODING}" ValueType="${TOKEN_TYPE}">${cert.raw.toString("base64")}</wsse:BinarySecurityToken></wsse:Security></soap:Header><soap:Body wsu:Id="body"><tns:Trzba><tns:Hlavicka uuid_zpravy="${input.messageId}" dat_odesl="${escapeXml(input.sentAt)}" prvni_zaslani="${input.first ? "true" : "false"}"${input.verification ? ' overeni="true"' : ""}/><tns:Data ${attrs}/></tns:Trzba></soap:Body></soap:Envelope>`;
  const signature = new SignedXml({ idMode: "wssecurity", privateKey, publicCert: input.certificate,
    signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: EXCLUSIVE,
    getKeyInfoContent: () => `<wsse:SecurityTokenReference xmlns:wsse="${WSSE_NS}"><wsse:Reference URI="#cert" ValueType="${TOKEN_TYPE}"/></wsse:SecurityTokenReference>`,
  });
  signature.addReference({ xpath: `/*[local-name()='Envelope' and namespace-uri()='${SOAP_NS}']/*[local-name()='Body' and namespace-uri()='${SOAP_NS}']`, transforms: [EXCLUSIVE], digestAlgorithm: SHA256 });
  signature.computeSignature(xml, { prefix: "ds", location: { reference: `//*[local-name()='Security' and namespace-uri()='${WSSE_NS}']`, action: "append" } });
  const signed = signature.getSignedXml();
  if (Buffer.byteLength(signed, "utf8") > 12 * 1024) throw new Error("EET request exceeds the official 12 kB limit.");
  return signed;
}

/** WSDL action must come from the downloaded official WSDL, never an EET 1.0 constant. */
export function soapActionFromWsdl(wsdl: string) {
  const doc = parseXml(wsdl);
  if (doc.documentElement?.getAttribute("targetNamespace") !== EET_NAMESPACE) throw new Error("WSDL is not for the EET v4 namespace.");
  const operations = doc.getElementsByTagNameNS("http://schemas.xmlsoap.org/wsdl/soap/", "operation");
  if (operations.length !== 1 || !operations.item(0)!.hasAttribute("soapAction")) throw new Error("Review the official WSDL operation before enabling EET.");
  const action = operations.item(0)!.getAttribute("soapAction")!;
  if (/[\r\n"]/.test(action)) throw new Error("Unsafe SOAPAction.");
  return action;
}

/** Trust is provisioned out-of-band; never trust the certificate supplied by the response itself. */
function verifiedResponseBody(xml: string, doc: Document, trustedCertificates: string[]): Element {
  const body = oneElement(doc, SOAP_NS, "Body");
  const signatureNode = oneElement(doc, DS_NS, "Signature");
  if (signatureNode.parentNode !== oneElement(doc, WSSE_NS, "Security")) throw new Error("Invalid acknowledgment signature location.");
  const signedInfo = oneElement(signatureNode, DS_NS, "SignedInfo");
  if (oneElement(signedInfo, DS_NS, "SignatureMethod").getAttribute("Algorithm") !== RSA_SHA256 ||
      oneElement(signedInfo, DS_NS, "CanonicalizationMethod").getAttribute("Algorithm") !== EXCLUSIVE ||
      oneElement(signedInfo, DS_NS, "DigestMethod").getAttribute("Algorithm") !== SHA256) throw new Error("Unexpected acknowledgment signature algorithms.");
  const refs = signedInfo.getElementsByTagNameNS(DS_NS, "Reference");
  if (refs.length !== 1) throw new Error("Acknowledgment must sign exactly one SOAP body.");
  const bodyId = body.getAttributeNS(WSU_NS, "Id") || body.getAttribute("Id");
  if (!bodyId || refs.item(0)!.getAttribute("URI") !== `#${bodyId}`) throw new Error("Acknowledgment signature does not bind the SOAP body.");
  const transforms = signedInfo.getElementsByTagNameNS(DS_NS, "Transform");
  if (transforms.length !== 1 || transforms.item(0)!.getAttribute("Algorithm") !== EXCLUSIVE) throw new Error("Unsupported acknowledgment transform.");
  for (const pem of trustedCertificates) {
    try {
      assertCertificate(pem);
      const verifier = new SignedXml({ idMode: "wssecurity", publicCert: pem, getCertFromKeyInfo: () => null });
      verifier.loadSignature(new XMLSerializer().serializeToString(signatureNode));
      if (!verifier.checkSignature(xml)) continue;
      const signed = verifier.getSignedReferences();
      if (signed.length !== 1) continue;
      // Parse ONLY the verified signed reference, so wrapping/unsigned sibling data cannot be used.
      const verified = parseXml(signed[0]);
      if (!verified.documentElement || verified.documentElement.localName !== "Body" || verified.documentElement.namespaceURI !== SOAP_NS) continue;
      return verified.documentElement;
    } catch { /* Try the next explicitly trusted signing certificate during rotation. */ }
  }
  throw new Error("Acknowledgment signature could not be verified against trusted tax-authority certificates.");
}

export function parseEetResponse(xml: string, messageId: string, environment: EetEnvironment, trustedCertificates: string[], verification = false): EetResult {
  const doc = parseXml(xml);
  const envelope = doc.documentElement;
  if (!envelope || envelope.localName !== "Envelope" || envelope.namespaceURI !== SOAP_NS) throw new Error("Unexpected SOAP envelope.");
  const body = oneElement(doc, SOAP_NS, "Body");
  if (body.parentNode !== envelope) throw new Error("Invalid SOAP body placement.");
  const children = directChildren(body);
  if (children.length !== 1 || children[0].localName !== "Odpoved" || children[0].namespaceURI !== EET_NAMESPACE) throw new Error("Unexpected SOAP response.");
  const accepted = children[0].getElementsByTagNameNS(EET_NAMESPACE, "Potvrzeni").length > 0;
  const trustedBody = accepted ? verifiedResponseBody(xml, doc, trustedCertificates) : body;
  const response = oneElement(trustedBody, EET_NAMESPACE, "Odpoved");
  const headers = response.getElementsByTagNameNS(EET_NAMESPACE, "Hlavicka");
  if (headers.length > 1 || (headers.length === 1 && headers.item(0)!.hasAttribute("uuid_zpravy") && headers.item(0)!.getAttribute("uuid_zpravy") !== messageId)) throw new Error("EET response UUID mismatch.");
  const warnings = Array.from(response.getElementsByTagNameNS(EET_NAMESPACE, "Varovani")).map(el => ({ code: el.getAttribute("kod_varov") ?? "", message: (el.textContent ?? "").slice(0, 100) }));
  const errors = response.getElementsByTagNameNS(EET_NAMESPACE, "Chyba");
  if (errors.length) {
    if (accepted || errors.length !== 1) throw new Error("Ambiguous EET response.");
    const error = errors.item(0)!;
    const code = error.getAttribute("kod") ?? "";
    if (!/^-?\d{1,3}$/.test(code)) throw new Error("Invalid EET error code.");
    if ((["true", "1"].includes(error.getAttribute("test") ?? "")) !== (environment === "playground")) throw new Error("EET environment mismatch.");
    if (code === "0" && verification) return { kind: "verified", warnings };
    if (code === "0") throw new Error("Verification response cannot acknowledge a payment.");
    return { kind: "rejected", code, message: (error.textContent ?? "").slice(0, 100), retryable: code === "-1" };
  }
  if (verification) throw new Error("Connection verification unexpectedly returned an operational acknowledgment.");
  const confirmation = oneElement(response, EET_NAMESPACE, "Potvrzeni");
  const header = oneElement(response, EET_NAMESPACE, "Hlavicka");
  const pok = confirmation.getAttribute("pok") ?? "";
  const test = ["true", "1"].includes(confirmation.getAttribute("test") ?? "");
  const receivedAt = header.getAttribute("dat_prij") ?? "";
  if (header.getAttribute("uuid_zpravy") !== messageId || !Number.isFinite(Date.parse(receivedAt)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{2}$/i.test(pok)) throw new Error("Invalid EET acknowledgment identity.");
  if (test !== (environment === "playground") || (environment === "playground" ? !pok.endsWith("-ff") : pok.endsWith("-ff"))) throw new Error("Acknowledgment environment mismatch.");
  return { kind: "accepted", acknowledgment: { pok, receivedAt, messageId, test, warnings } };
}

export function serializeXml(doc: Document) { return new XMLSerializer().serializeToString(doc); }
