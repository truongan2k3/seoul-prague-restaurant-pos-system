export type ProbeStage = "credentials" | "signing" | "network" | "response_trust" | "response";
const defaults: Record<ProbeStage, { code: string; message: string }> = {
  credentials: { code: "EET_TEST_CREDENTIALS", message: "Certificate/protocol setup could not be loaded. Check the saved WSDL/XSD and certificate for the selected environment." },
  signing: { code: "EET_TEST_SIGNING", message: "The test request could not be signed. Check the certificate/private key and saved Unit ID and POS identifier." },
  network: { code: "EET_TEST_NETWORK", message: "The EET endpoint could not be reached within the time limit. Check server connectivity and retry; no POS payment was created." },
  response_trust: { code: "EET_TEST_RESPONSE_TRUST", message: "The response signer could not be trusted. Check step 3 certificates and access to the I.CA revocation endpoints." },
  response: { code: "EET_TEST_RESPONSE", message: "The response did not pass XML, signature, request-ID or environment validation. Reporting remains unchanged." },
};

export class EetProbeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

// Never return arbitrary crypto/parser/SDK exceptions to the browser. Only these
// exact known messages or static stage descriptions can cross the action boundary.
function describe(stage: ProbeStage, error: unknown) {
  if (error instanceof EetProbeError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/^Configure server-only EET_(PLAYGROUND|PRODUCTION)_RESPONSE_CERTS_PEM_BASE64\.$/.test(message) || message === "Install trusted tax-authority response signing certificates.") {
    return new EetProbeError("EET_TEST_STEP_3_MISSING", "Step 3 is not saved for the selected environment. In Tax-office files & certificates, select the environment used by this test, upload both official I.CA files and click Save response signing certificates. The signed Playground test uses Playground; Production imports are separate.");
  }
  if (/^Configure server-only EET_(PLAYGROUND|PRODUCTION)_(CERT|KEY)_PEM_BASE64\.$/.test(message)) return new EetProbeError("EET_TEST_REGISTER_CERT_MISSING", "Step 2 register certificate/private key is missing for this environment. Import and save the matching .p12 file before testing.");
  if (/^Configure server-only EET_OFFICIAL_(WSDL|XSD)_BASE64\.$/.test(message)) return new EetProbeError("EET_TEST_PROTOCOL_MISSING", "Step 1 is incomplete. Save both official WSDL and XSD files before testing.");
  const known: Record<string, { code: string; message: string }> = {
    "Invalid registrating unit identifier.": { code: "EET_TEST_UNIT_ID", message: "The saved Unit ID must be 1–9 digits and must not start with zero. Correct Business and register, save, then retry." },
    "Invalid register identifier.": { code: "EET_TEST_REGISTER_ID", message: "The saved POS/register identifier must be 1–20 supported ASCII characters. Correct Business and register, save, then retry." },
    "EET private key does not match the certificate.": { code: "EET_TEST_KEY_MISMATCH", message: "The register certificate and private key do not match. Reimport the matching .p12 file for this environment in step 2." },
    "Official protocol artifact checksum mismatch.": { code: "EET_TEST_PROTOCOL_CHECKSUM", message: "The saved WSDL/XSD does not match its expected checksum. Recheck and save the official protocol files in step 1." },
    "Production is locked. Explicit production approval and compliance review are required.": { code: "EET_TEST_PRODUCTION_LOCKED", message: "Production is locked until explicit approval and compliance review. Use the Playground checks while completing setup." },
    "Review and pin the official WSDL/XSD before submission.": { code: "EET_TEST_PROTOCOL_REVIEW", message: "The official protocol review is not approved for this operation. Use Playground checks while completing acceptance and review." },
    "EET certificate is not currently valid.": { code: "EET_TEST_CERT_EXPIRED", message: "One of the saved certificates has expired or is not yet valid. Check its dates and import a current certificate." },
    "EET certificate EIČ does not match the fiscal identity.": { code: "EET_TEST_EIC_MISMATCH", message: "The certificate EIČ does not match the identity used by this test. Check the selected environment and register certificate." },
    "Stored EET material could not be decrypted. Check the server encryption key.": { code: "EET_TEST_DECRYPTION", message: "Saved EET files cannot be decrypted. Restore the original EET_SETTINGS_ENCRYPTION_KEY; do not generate a replacement key." },
    "Current signed I.CA revocation data could not be verified. Reporting remains pending.": { code: "EET_TEST_REVOCATION", message: "Current signed I.CA revocation data could not be verified. Check server access to the certificates' .ica.cz CRL endpoints and retry. Signature/revocation protection remains enabled." },
    "Response signer does not chain to the trusted authority.": { code: "EET_TEST_ISSUER_CHAIN", message: "The response signing certificate does not match the saved I.CA authority chain. Review the official signer/authority configuration for this environment." },
    "Invalid response signer reference.": { code: "EET_TEST_SIGNER_REFERENCE", message: "The response uses an unsupported signing-certificate reference. Its signature has not been accepted; the response format needs review." },
    "Use an official reserved Playground certificate for the signed response test.": { code: "EET_TEST_PLAYGROUND_IDENTITY", message: "Import an official Playground .p12 certificate from step 2. The signed test accepts only reserved Playground identities." },
  };
  const issue = Object.hasOwn(known, message) ? known[message] : defaults[stage];
  return new EetProbeError(issue.code, issue.message);
}

export async function probeStep<T>(stage: ProbeStage, operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw describe(stage, error); }
}
