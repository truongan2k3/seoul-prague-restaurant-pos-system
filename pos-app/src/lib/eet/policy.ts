import type { EetData, EetEnvironment, EetMode } from "./types";

export const EET_ENDPOINTS: Record<EetEnvironment, string> = {
  playground: "https://pg.trzbyeet.gov.cz/eet/services/EETServiceSOAP/v4",
  production: "https://trzbyeet.gov.cz/eet/services/EETServiceSOAP/v4",
};
export const EET_NAMESPACE = "http://fs.gov.cz/eet/schema/v4";

export function assertProductionAllowed(environment: EetMode, env: Record<string, string | undefined> = process.env) {
  if (environment === "production" && (env.EET_PRODUCTION_APPROVED !== "true" || env.EET_COMPLIANCE_REVIEW_APPROVED !== "true")) {
    throw new Error("Production is locked. Explicit production approval and compliance review are required.");
  }
}

export function assertAdminGrant(role: string, staffId: string, grants: string | undefined) {
  // Legacy cashier is normalized to admin by this POS. The independent deployment allowlist
  // prevents publicly editable legacy staff rows from granting EET administration.
  if (!["admin", "cashier"].includes(role) || !grants?.split(",").map(s => s.trim()).includes(staffId)) {
    throw new Error("EET administrator permission required.");
  }
}

export function retryDelayMs(attempt: number, random = Math.random()) {
  return Math.round(Math.min(3_600_000, 5_000 * 2 ** Math.min(Math.max(0, attempt - 1), 10) * (0.8 + 0.4 * random)));
}

/** Required ISO timezone, seconds precision. Data is frozen at enqueue, never reconstructed on retry. */
export function validateData(data: EetData) {
  const ascii = /^[0-9a-zA-Z.,:;/#_\- ]+$/;
  if (!/^CZ\d{8,10}$/.test(data.eic_popl)) throw new Error("Invalid EIČ.");
  if (!/^[1-9]\d{0,8}$/.test(data.id_jednotky)) throw new Error("Invalid registrating unit identifier.");
  if (!ascii.test(data.id_pokl) || data.id_pokl.length > 20) throw new Error("Invalid register identifier.");
  if (!ascii.test(data.porad_cis) || data.porad_cis.length > 25) throw new Error("Invalid transaction sequence.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(data.dat_trzby) || !Number.isFinite(Date.parse(data.dat_trzby))) throw new Error("Invalid transaction time.");
  for (const amount of [data.celk_trzba, data.urceno_cerp_zuct, data.cerp_zuct]) {
    if (amount !== undefined && !/^-?(?:0|[1-9]\d{0,7})\.\d{2}$/.test(amount)) throw new Error("Invalid CZK fiscal amount.");
  }
}

/** Protect spreadsheets from formula injection, including whitespace-prefixed formulas. */
export function csvCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `"${value}"`;
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
