import "server-only";
import { assertProductionAllowed } from "./policy";
import { assertCertificate, sha256, soapActionFromWsdl } from "./xml";
import type { EetEnvironment } from "./types";
import { decryptStoredMaterial, getStoredMaterial, type ProtocolMaterial, type ResponseMaterial, type SignerMaterial } from "./material-store";

function secret(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure server-only ${name}.`);
  return Buffer.from(value, "base64").toString("utf8");
}
export async function loadCredentials(environment: EetEnvironment, eic: string, options?: { verification?: boolean }) {
  assertProductionAllowed(environment);
  if (process.env.EET_PROTOCOL_REVIEWED !== "true" && !(environment === "playground" && options?.verification)) throw new Error("Review and pin the official WSDL/XSD before submission.");
  const prefix = `EET_${environment.toUpperCase()}`;
  const [protocolRecord, signerRecord, responseRecord] = await Promise.all([
    getStoredMaterial("shared", "protocol"), getStoredMaterial(environment, "signer"), getStoredMaterial(environment, "response"),
  ]);
  const signer = signerRecord ? decryptStoredMaterial<SignerMaterial>(signerRecord) : null;
  const protocol = protocolRecord ? decryptStoredMaterial<ProtocolMaterial>(protocolRecord) : null;
  const response = responseRecord ? decryptStoredMaterial<ResponseMaterial>(responseRecord) : null;
  const certificate = signer ? signer.certificate : secret(`${prefix}_CERT_PEM_BASE64`);
  assertCertificate(certificate, eic);
  const privateKey = signer ? signer.privateKey : secret(`${prefix}_KEY_PEM_BASE64`);
  const trustedCertificates = response ? response.certificates : secret(`${prefix}_RESPONSE_CERTS_PEM_BASE64`).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (!trustedCertificates.length) throw new Error("Install trusted tax-authority response signing certificates.");
  for (const pem of trustedCertificates) assertCertificate(pem);
  const wsdl = protocol ? protocol.wsdl : secret("EET_OFFICIAL_WSDL_BASE64");
  const xsd = protocol ? protocol.xsd : secret("EET_OFFICIAL_XSD_BASE64");
  if (sha256(wsdl) !== (protocol ? protocol.wsdlSha256 : process.env.EET_OFFICIAL_WSDL_SHA256) || sha256(xsd) !== (protocol ? protocol.xsdSha256 : process.env.EET_OFFICIAL_XSD_SHA256)) throw new Error("Official protocol artifact checksum mismatch.");
  // XSD validation against these exact bytes is a deployment acceptance test, not a guessed schema.
  const soapAction = soapActionFromWsdl(wsdl);
  return { certificate, privateKey, trustedCertificates, soapAction, passphrase: signer ? signer.passphrase : process.env[`${prefix}_KEY_PASSPHRASE`] };
}

/** Only public metadata crosses into React. Neither certificate bytes nor keys are returned. */
export async function certificateStatus(environment: EetEnvironment) {
  let configured = Boolean(process.env[`EET_${environment.toUpperCase()}_CERT_PEM_BASE64`]);
  let source: "pos" | "environment" = "environment";
  try {
    const stored = await getStoredMaterial(environment, "signer");
    if (stored) { configured = true; source = "pos"; }
    const pem = stored ? decryptStoredMaterial<SignerMaterial>(stored).certificate : secret(`EET_${environment.toUpperCase()}_CERT_PEM_BASE64`);
    const cert = assertCertificate(pem);
    const daysRemaining = Math.floor((new Date(cert.validTo).getTime() - Date.now()) / 86_400_000);
    return { configured: true, valid: true, expiresAt: cert.validTo, daysRemaining, warning: daysRemaining <= 30, fingerprint: cert.fingerprint256, source };
  } catch {
    return { configured, valid: false, expiresAt: null, daysRemaining: null, warning: true, fingerprint: null, source };
  }
}
