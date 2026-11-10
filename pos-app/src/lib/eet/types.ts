export type EetMode = "disabled" | "playground" | "production";
export type EetEnvironment = Exclude<EetMode, "disabled">;
export type EetStatus = "pending" | "processing" | "retrying" | "uncertain" | "accepted" | "failed" | "blocked";
export type TipPolicy = "review_required" | "business_income" | "employee_income";

export interface EetSettings {
  business_id: string;
  mode: EetMode;
  submission_control: "automatic" | "paused";
  business_name: string;
  establishment_address: string;
  eic: string;
  unit_id: string;
  register_id: string;
  tip_policy: TipPolicy;
  live_reporting_started_at: string | null;
  capture_environment: EetEnvironment | null;
  last_success_at: string | null;
  worker_seen_at: string | null;
  worker_error: string | null;
  updated_at: string;
  version: number;
}

/** Immutable fiscal identity. Headers and signing certificates can change on retry; this cannot. */
export interface EetData {
  eic_popl: string;
  id_jednotky: string;
  id_pokl: string;
  porad_cis: string;
  dat_trzby: string;
  celk_trzba: string;
  urceno_cerp_zuct?: string;
  cerp_zuct?: string;
}

export interface EetTransaction {
  id: string;
  business_id: string;
  sale_id: string;
  environment: EetEnvironment;
  revision: number;
  kind: "sale" | "correction";
  parent_id: string | null;
  payment_method: "cash" | "card";
  amount: string | number;
  data: EetData;
  status: EetStatus;
  block_reason: string | null;
  attempt_count: number;
  next_attempt_at: string;
  lease_token: string | null;
  lease_until: string | null;
  acknowledgment: EetAcknowledgment | null;
  last_error: string | null;
  created_at: string;
  due_at: string;
}

export interface EetAcknowledgment {
  pok: string;
  receivedAt: string;
  messageId: string;
  test: boolean;
  warnings: { code: string; message: string }[];
}

export type EetResult =
  | { kind: "accepted"; acknowledgment: EetAcknowledgment }
  | { kind: "verified"; warnings: { code: string; message: string }[] }
  | { kind: "rejected"; code: string; message: string; retryable: boolean };

export interface EetCheckoutContext {
  enabled: boolean;
  tableId: string;
  visit: string | null;
  revision: number;
  pendingKey: string | null;
  mode: EetMode;
  control: "automatic" | "paused";
}

export interface EetPaymentIntent {
  key: string;
  expectedVisit: string | null;
  expectedRevision: number;
}
