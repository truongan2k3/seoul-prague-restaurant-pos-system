"use server";

import { X509Certificate, createPrivateKey } from "node:crypto";
import { eetActor } from "./auth";
import { encryptMaterial, type MaterialEnvironment, type MaterialKind } from "./material-crypto";
import { parsePkcs12, validateProtocol, validateResponseCertificates, validateSigner } from "./material-validation";
import { soapActionFromWsdl } from "./xml";
import type { MaterialMetadata, SignerMaterial } from "./material-store";

const SOURCE = "https://eet.gov.cz/cs/pro-vyvojare/dokumenty-ke-stazeni";
function field(form: FormData, name: string, max: number) {
  const value = form.get(name);
  if (value !== null && typeof value !== "string") throw new Error("Invalid input.");
  const text = value ?? "";
  if (Buffer.byteLength(text, "utf8") > max) throw new Error("Input exceeds the allowed size.");
  return text;
}
function upload(form: FormData, name: string, max: number) {
  const file = form.get(name);
  if (file === null || (typeof file === "string" && !file)) return null;
  if (!(file instanceof File) || file.size > max) throw new Error("Invalid upload size.");
  return file.size > 0 ? file : null;
}
async function textOrFile(form: FormData, textName: string, fileName: string, max: number, certificate = false) {
  const text = field(form, textName, max);
  const file = upload(form, fileName, max);
  if (text.trim() && file) throw new Error("Choose a file or paste its contents, not both.");
  if (!file) return text;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (certificate && !bytes.toString("utf8").includes("-----BEGIN CERTIFICATE-----")) return new X509Certificate(bytes).toString();
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
function environment(form: FormData): Exclude<MaterialEnvironment, "shared"> {
  const value = field(form, "environment", 20);
  if (value !== "playground" && value !== "production") throw new Error("Choose the credential environment.");
  return value;
}
function version(form: FormData) {
  const value = Number(field(form, "version", 10));
  if (!Number.isInteger(value) || value < 0) throw new Error("Reload the material version.");
  return value;
}
async function save(context: Awaited<ReturnType<typeof eetActor>>, env: MaterialEnvironment, kind: MaterialKind, expectedVersion: number, payload: unknown, metadata: MaterialMetadata) {
  const envelope = encryptMaterial({ businessId: context.businessId, environment: env, kind }, payload);
  const { error } = await context.db.rpc("eet_save_material", { p_business: context.businessId, p_actor: context.staff.id,
    p_environment: env, p_kind: kind, p_version: expectedVersion, p_envelope: envelope, p_metadata: metadata });
  if (error) throw new Error(error.message.includes("changed") ? "Material changed. Reload Settings before replacing it." : "Material could not be stored. Check the encryption key and material-storage migration.");
}

export async function importEetProtocolAction(form: FormData) {
  const context = await eetActor(true);
  const expectedVersion = version(form);
  if (form.get("sourceReviewed") !== "on") throw new Error("Confirm that the files came from the official EET developer website.");
  let material: ReturnType<typeof validateProtocol>;
  try {
    const wsdl = await textOrFile(form, "wsdl", "wsdlFile", 64 * 1024);
    const xsd = await textOrFile(form, "xsd", "xsdFile", 64 * 1024);
    material = validateProtocol(wsdl, xsd);
  } catch { throw new Error("Import failed. Provide both official EET v4 WSDL and XSD (64 KB each), using either files or pasted XML. Scripts, HTML and DTDs are not accepted."); }
  await save(context, "shared", "protocol", expectedVersion, material, {
    source: SOURCE, wsdlSha256: material.wsdlSha256, xsdSha256: material.xsdSha256, soapAction: soapActionFromWsdl(material.wsdl),
  });
  return { message: "Protocol files stored. Checksums were calculated automatically; technical/Playground acceptance is still required." };
}

export async function importEetSignerAction(form: FormData) {
  const context = await eetActor(true);
  const env = environment(form), expectedVersion = version(form);
  let material: SignerMaterial;
  let metadata: MaterialMetadata;
  try {
    const passphrase = field(form, "password", 1024);
    if (form.get("format") === "pkcs12") {
      const bundle = upload(form, "bundle", 128 * 1024);
      if (!bundle) throw new Error("Provide a PKCS#12 bundle.");
      const bytes = new Uint8Array(await bundle.arrayBuffer());
      try { material = parsePkcs12(bytes, passphrase); } finally { bytes.fill(0); }
    } else if (form.get("format") === "pem") {
      material = { certificate: await textOrFile(form, "certificate", "certificateFile", 16 * 1024, true),
        privateKey: await textOrFile(form, "privateKey", "privateKeyFile", 32 * 1024), passphrase: passphrase || undefined };
    } else throw new Error("Choose a supported certificate format.");
    metadata = { ...validateSigner(material), source: env === "playground" ? SOURCE : "DIS+ / MOJE daně — operator-provided certificate" };
    // The import password is used once. Store only a normalized key inside authenticated encryption.
    material = { certificate: new X509Certificate(material.certificate).toString(),
      privateKey: createPrivateKey({ key: material.privateKey, passphrase: material.passphrase }).export({ format: "pem", type: "pkcs8" }).toString() };
  } catch { throw new Error("Certificate import failed. Check the file/password, current validity, EIČ, RSA key and certificate/key match. No credential was saved."); }
  const { data: cfg, error } = await context.db.from("eet_settings").select("eic,capture_environment").eq("business_id", context.businessId).maybeSingle();
  if (error) throw new Error("Could not verify the saved fiscal identity.");
  if (cfg?.capture_environment === env && cfg.eic !== metadata.eic) throw new Error("Certificate EIČ differs from the active fiscal identity. The existing credential was preserved.");
  await save(context, env, "signer", expectedVersion, material, metadata);
  return { message: `${env === "production" ? "Production" : "Playground"} certificate stored securely. Private key and password will not be displayed again. Reporting mode is unchanged.` };
}

export async function importEetResponseCertificatesAction(form: FormData) {
  const context = await eetActor(true);
  const env = environment(form), expectedVersion = version(form);
  if (form.get("trustReviewed") !== "on") throw new Error("Confirm the tax-authority response signing certificate source.");
  let material: ReturnType<typeof validateResponseCertificates>;
  try {
    const root = upload(form, "responseRootFile", 16 * 1024), issuer = upload(form, "responseIssuerFile", 16 * 1024);
    const direct = await textOrFile(form, "responseCertificates", "responseFile", 64 * 1024, true);
    if ((root || issuer) && (direct.trim() || !root || !issuer)) throw new Error("Choose both I.CA files or paste PEM, not both.");
    const readCertificate = async (file: File) => new X509Certificate(Buffer.from(await file.arrayBuffer())).toString();
    material = validateResponseCertificates(root && issuer ? `${await readCertificate(root)}\n${await readCertificate(issuer)}` : direct);
  }
  catch { throw new Error("Upload both official I.CA RSA root/intermediate certificates with matching published fingerprints, or independently verified signing leaf PEMs. Unapproved CA certificates, taxpayer certificates and scripts are rejected."); }
  const certificates = material.certificates.map(pem => new X509Certificate(pem));
  const expiresAt = new Date(Math.min(...certificates.map(c => new Date(c.validTo).getTime()))).toISOString();
  await save(context, env, "response", expectedVersion, material, { source: certificates[0].ca ? "https://www.ica.cz/korenove-certifikaty" : SOURCE, certificateCount: certificates.length, expiresAt, fingerprint: certificates[0].fingerprint256 });
  return { message: "Response trust stored. I.CA chain mode checks issuer signatures, validity, key usage and current signed revocation lists. Operational Playground acceptance is still required before live reporting." };
}
