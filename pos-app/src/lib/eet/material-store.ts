import "server-only";
import { eetDb, requireEetBusinessId } from "./db";
import { decryptMaterial, type EncryptedMaterial, type MaterialEnvironment, type MaterialKind } from "./material-crypto";

export interface ProtocolMaterial { wsdl: string; xsd: string; wsdlSha256: string; xsdSha256: string }
export interface SignerMaterial { certificate: string; privateKey: string; passphrase?: string }
export interface ResponseMaterial { certificates: string[] }
export interface MaterialMetadata {
  fingerprint?: string; expiresAt?: string; eic?: string; certificateCount?: number;
  wsdlSha256?: string; xsdSha256?: string; soapAction?: string; source?: string;
}
export interface MaterialSummary { environment: MaterialEnvironment; kind: MaterialKind; metadata: MaterialMetadata; version: number; updated_at: string }

function missingTable(error: { code?: string }) { return error.code === "42P01" || error.code === "PGRST205"; }
export async function getMaterialOverview(businessId: string) {
  const { data, error } = await eetDb().from("eet_materials").select("environment,kind,metadata,version,updated_at").eq("business_id", businessId);
  if (error) {
    if (missingTable(error)) return { storageReady: false, items: [] as MaterialSummary[] };
    throw new Error("EET material status unavailable.");
  }
  const rows = (data ?? []) as MaterialSummary[];
  // Explicit DTO boundary: no encrypted envelopes or future storage-only columns reach React.
  return { storageReady: true, items: rows.map(row => ({ environment: row.environment, kind: row.kind, version: row.version, updated_at: row.updated_at,
    metadata: Object.fromEntries(["fingerprint", "expiresAt", "eic", "certificateCount", "wsdlSha256", "xsdSha256", "soapAction", "source"]
      .filter(key => Object.hasOwn(row.metadata, key)).map(key => [key, row.metadata[key as keyof MaterialMetadata]])) as MaterialMetadata,
  })) };
}
export async function getStoredMaterial(environment: MaterialEnvironment, kind: MaterialKind) {
  const businessId = requireEetBusinessId();
  const { data, error } = await eetDb().from("eet_materials").select("envelope").eq("business_id", businessId).eq("environment", environment).eq("kind", kind).maybeSingle();
  if (error) {
    if (missingTable(error)) return null; // Existing environment-managed installations remain compatible.
    throw new Error("EET material storage unavailable.");
  }
  if (!data) return null;
  return { businessId, environment, kind, envelope: data.envelope as EncryptedMaterial };
}
export function decryptStoredMaterial<T>(record: NonNullable<Awaited<ReturnType<typeof getStoredMaterial>>>) {
  return decryptMaterial<T>({ businessId: record.businessId, environment: record.environment, kind: record.kind }, record.envelope);
}
