import "server-only";
import { assertProductionAllowed } from "./policy";
import { assertCertificate, sha256, soapActionFromWsdl } from "./xml";
import type { EetEnvironment } from "./types";

function secret(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure server-only ${name}.`);
  return Buffer.from(value, "base64").toString("utf8");
}
export function loadCredentials(environment: EetEnvironment, eic: string) {
  assertProductionAllowed(environment);
  if (process.env.EET_PROTOCOL_REVIEWED !== "true") throw new Error("Review and pin the official WSDL/XSD before submission.");
  const prefix = `EET_${environment.toUpperCase()}`;
  const certificate = secret(`${prefix}_CERT_PEM_BASE64`);
  assertCertificate(certificate, eic);
  const privateKey = secret(`${prefix}_KEY_PEM_BASE64`);
  const trustedCertificates = secret(`${prefix}_RESPONSE_CERTS_PEM_BASE64`).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (!trustedCertificates.length) throw new Error("Install trusted tax-authority response signing certificates.");
  for (const pem of trustedCertificates) assertCertificate(pem);
  const wsdl = secret("EET_OFFICIAL_WSDL_BASE64");
  const xsd = secret("EET_OFFICIAL_XSD_BASE64");
  if (sha256(wsdl) !== process.env.EET_OFFICIAL_WSDL_SHA256 || sha256(xsd) !== process.env.EET_OFFICIAL_XSD_SHA256) throw new Error("Official protocol artifact checksum mismatch.");
  // XSD validation against these exact bytes is a deployment acceptance test, not a guessed schema.
  const soapAction = soapActionFromWsdl(wsdl);
  return { certificate, privateKey, trustedCertificates, soapAction, passphrase: process.env[`${prefix}_KEY_PASSPHRASE`] };
}

/** Only public metadata crosses into React. Neither certificate bytes nor keys are returned. */
export function certificateStatus(environment: EetEnvironment) {
  try {
    const pem = secret(`EET_${environment.toUpperCase()}_CERT_PEM_BASE64`);
    const cert = assertCertificate(pem);
    const daysRemaining = Math.floor((new Date(cert.validTo).getTime() - Date.now()) / 86_400_000);
    return { configured: true, valid: true, expiresAt: cert.validTo, daysRemaining, warning: daysRemaining <= 30, fingerprint: cert.fingerprint256 };
  } catch {
    return { configured: Boolean(process.env[`EET_${environment.toUpperCase()}_CERT_PEM_BASE64`]), valid: false, expiresAt: null, daysRemaining: null, warning: true, fingerprint: null };
  }
}
