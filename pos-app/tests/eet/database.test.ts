import assert from "node:assert/strict";
import { before, beforeEach, after, describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const BUSINESS = "10000000-0000-4000-a000-000000000001";
const STAFF = "20000000-0000-4000-a000-000000000001";
const TABLE = "30000000-0000-4000-a000-000000000001";
const VISIT = "2026-11-10T18:00:00+00:00";
let migration: string;
const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE TABLE businesses(id uuid PRIMARY KEY,name text);
CREATE TABLE staff(id uuid PRIMARY KEY,business_id uuid,active boolean DEFAULT true,role text,name text);
CREATE TABLE tables(id uuid PRIMARY KEY,label text,status text,occupied_at timestamptz,payment_status text);
CREATE TABLE sales(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),table_id uuid REFERENCES tables(id),table_label text,staff_id uuid REFERENCES staff(id),staff_name text,
 subtotal numeric(10,2) NOT NULL,discount_amount numeric(10,2) DEFAULT 0 NOT NULL,discount_type text,discount_value numeric,
 tip numeric(10,2) DEFAULT 0 NOT NULL,tip_payment_method text,grand_total numeric(10,2),payment_method text NOT NULL,
 amount_given numeric,change_due numeric,split_mode text,split_count integer,items jsonb NOT NULL,
 closed_at timestamptz DEFAULT now() NOT NULL,deleted_at timestamptz,seated_at timestamptz,
 voucher_discount_amount numeric DEFAULT 0,voucher_codes text[],
 referral_code_id uuid,referral_discount_amount numeric NOT NULL DEFAULT 0,
 referral_actor_id uuid,referral_actor_name text,referral_adjustment_reason text
);
GRANT ALL ON businesses,staff,tables,sales TO service_role,anon,authenticated;
`;
let db: PGlite;
async function sql<T extends Record<string, unknown>>(query: string, args: unknown[] = []) { return (await db.query<T>(query, args)).rows; }
function payment(overrides: Record<string, unknown> = {}) {
  return { table_id: TABLE, table_label: "A2", staff_id: STAFF, subtotal: 200, discount_amount: 20, tip: 10, grand_total: 190,
    payment_method: "cash", split_mode: "total", split_count: 1, items: [{ id: "dish", price: 200, quantity: 1 }], seated_at: VISIT,
    eet_settlement_payload: { closeTable: true }, ...overrides };
}
async function configure(mode = "playground", control = "automatic", tip = "employee_income") {
  await sql(`INSERT INTO eet_settings(business_id,mode,submission_control,capture_environment,eic,unit_id,register_id,tip_policy)
    VALUES($1,$2,$3,$2,'CZ00000019','11','SEOUL-1',$4)`, [BUSINESS, mode, control, tip]);
}
async function commit(sale = payment(), key = randomUUID(), revision = 0, fingerprint = "a".repeat(64)) {
  return (await sql<{ result: { id: string; replayed: boolean; skipSettlement: boolean } }>("SELECT eet_commit_sale($1::jsonb,$2,$3,$4,$5,$6) AS result", [sale, BUSINESS, STAFF, key, fingerprint, revision]))[0].result;
}
async function claim() { return (await sql<{ id: string; lease_token: string; data: Record<string, string> }>("SELECT * FROM eet_claim($1)", [BUSINESS]))[0]; }
async function attempt(job: { id: string; lease_token: string }) { return (await sql<{ id: string; message_id: string; attempt_number: number }>("SELECT * FROM eet_begin_attempt($1,$2,NULL)", [job.id, job.lease_token]))[0]; }
async function finish(job: { id: string; lease_token: string }, attemptId: string | null, status: string) {
  const attemptRow = attemptId ? (await sql<{ message_id: string }>("SELECT message_id FROM eet_attempts WHERE id=$1", [attemptId]))[0] : null;
  const acknowledgment = { pok: `${randomUUID()}-ff`, messageId: attemptRow?.message_id, test: true };
  return (await sql<{ result: boolean }>("SELECT eet_finish_attempt($1,$2,$3,$4,$5::jsonb,now()-interval '1 second',$6,200,'trace-id','hash') AS result", [job.id, job.lease_token, attemptId, status, acknowledgment, status === "accepted" ? null : "test outage"]))[0].result;
}

describe("EET migration on an isolated PostgreSQL engine (no live Supabase data)", () => {
  before(async () => { migration = await readFile("supabase/migrations/202611100001_eet_integration.sql", "utf8"); db = new PGlite(); await db.exec(fixture); await db.exec(migration); await db.exec(await readFile("supabase/migrations/202611100002_eet_setup_materials.sql", "utf8")); });
  after(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false);
      TRUNCATE eet_attempts,eet_audit_logs,eet_transactions,eet_settings,sales,tables,staff,businesses RESTART IDENTITY CASCADE;
      INSERT INTO businesses VALUES('${BUSINESS}','SEOUL PRAGUE');
      INSERT INTO staff(id,business_id,role,name) VALUES('${STAFF}','${BUSINESS}','admin','Admin');
      INSERT INTO tables VALUES('${TABLE}','A2','waiting','${VISIT}','unpaid',0,NULL);`);
  });
  test("fresh disabled integration does not create fiscal records or rewrite historical payments", async () => {
    await commit();
    assert.equal((await sql("SELECT * FROM sales")).length, 1);
    assert.equal((await sql("SELECT * FROM eet_transactions")).length, 0);
  });
  test("encrypted imports are versioned and audited atomically without secret envelopes in audit", async () => {
    const envelope = { v: 1, keyId: "fixture-key-id", iv: "opaque-iv", tag: "opaque-tag", ciphertext: "opaque-ciphertext" };
    await sql("SELECT eet_save_material($1,$2,'playground','signer',0,$3,$4)", [BUSINESS, STAFF, envelope, { fingerprint: "public-fingerprint", eic: "CZ00000019" }]);
    const row = (await sql<{ version: number; envelope: unknown }>("SELECT * FROM eet_materials"))[0]; assert.equal(row.version, 1); assert.deepEqual(row.envelope, envelope);
    const audit = (await sql<{ details: Record<string, unknown> }>("SELECT details FROM eet_audit_logs WHERE action='material_imported'"))[0];
    assert.ok(!JSON.stringify(audit).includes("opaque-ciphertext"));
    await assert.rejects(() => sql("SELECT eet_save_material($1,$2,'playground','signer',0,$3,$4)", [BUSINESS, STAFF, envelope, {}]), /changed/);
    assert.equal((await sql("SELECT * FROM eet_audit_logs WHERE action='material_imported'")).length, 1);
  });
  test("material imports require an active administrator and keep environment types isolated", async () => {
    const envelope = { v: 1, keyId: "fixture", iv: "opaque", tag: "opaque", ciphertext: "opaque" };
    await sql("UPDATE staff SET role='server'");
    await assert.rejects(() => sql("SELECT eet_save_material($1,$2,'production','signer',0,$3,$4)", [BUSINESS, STAFF, envelope, {}]), /administrator/);
    await sql("UPDATE staff SET role='admin'");
    await assert.rejects(() => sql("SELECT eet_save_material($1,$2,'shared','signer',0,$3,$4)", [BUSINESS, STAFF, envelope, {}]), /check constraint/);
    await assert.rejects(() => sql("SELECT eet_save_material($1,$2,'production','signer',0,$3,$4)", [BUSINESS, STAFF, envelope, { privateKey: "must-not-be-metadata" }]), /metadata/);
    assert.equal((await sql("SELECT * FROM eet_materials")).length, 0);
  });
  test("anon cannot read encrypted material or call import RPCs; migrations keep mode disabled", async () => {
    await db.exec("SET ROLE anon; SELECT set_config('request.jwt.claim.role','anon',false)");
    await assert.rejects(() => sql("SELECT * FROM eet_materials"), /permission denied/);
    await assert.rejects(() => sql("SELECT eet_save_material($1,$2,'playground','signer',0,'{}','{}')", [BUSINESS, STAFF]), /permission denied/);
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false)");
    assert.equal((await sql("SELECT * FROM eet_settings")).length, 0);
  });
  test("cash payment and outbox commit together; employee tips excluded and discount applied once", async () => {
    await configure(); const saved = await commit();
    const jobs = await sql<{ amount: string; data: Record<string, string>; sale_id: string }>("SELECT * FROM eet_transactions");
    assert.equal(jobs.length, 1); assert.equal(jobs[0].sale_id, saved.id);
    assert.equal(jobs[0].amount, "180.00"); assert.equal(jobs[0].data.celk_trzba, "180.00");
    assert.equal(jobs[0].data.eic_popl, "CZ00000019");
    assert.equal(Number((await sql<{ referral_discount_amount: string }>("SELECT referral_discount_amount FROM sales"))[0].referral_discount_amount), 0);
  });
  test("standalone card is captured only on insertion of the confirmed POS sale; business tips included", async () => {
    await configure("playground", "automatic", "business_income");
    assert.equal((await sql("SELECT * FROM eet_transactions")).length, 0);
    await commit(payment({ payment_method: "card" }));
    const rows = await sql<{ amount: string; payment_method: string }>("SELECT * FROM eet_transactions");
    assert.equal(rows[0].payment_method, "card"); assert.equal(rows[0].amount, "190.00");
  });
  test("idempotent replay returns the same sale; conflicting reuse is rejected", async () => {
    await configure(); const key = randomUUID();
    const first = await commit(payment(), key); const replay = await commit(payment(), key);
    assert.equal(first.id, replay.id); assert.equal(replay.replayed, true);
    assert.equal((await sql("SELECT * FROM sales")).length, 1); assert.equal((await sql("SELECT * FROM eet_transactions")).length, 1);
    await assert.rejects(() => commit(payment(), key, 0, "b".repeat(64)), /Payment key conflict/);
  });
  test("concurrent payments from different devices cannot both capture the same revision", async () => {
    await configure();
    const outcomes = await Promise.allSettled([commit(), commit()]);
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await sql("SELECT * FROM sales")).length, 1);
  });
  test("split payments have independent durable jobs without division of their amounts again", async () => {
    await configure(); const firstKey = randomUUID();
    await commit(payment({ subtotal: 100, discount_amount: 0, tip: 0, grand_total: 100, split_mode: "equal", split_count: 2 }), firstKey);
    await sql("SELECT eet_finish_settlement($1,$2)", [TABLE, firstKey]);
    await commit(payment({ subtotal: 100, discount_amount: 0, tip: 0, grand_total: 100, payment_method: "card", split_mode: "equal", split_count: 2 }), randomUUID(), 1);
    const rows = await sql<{ total: string; n: number }>("SELECT sum(amount)::text AS total,count(*)::int AS n FROM eet_transactions");
    assert.equal(rows[0].total, "200.00"); assert.equal(rows[0].n, 2);
  });
  test("a stale table visit or stale payment revision cannot commit", async () => {
    await configure(); await assert.rejects(() => commit(payment({ seated_at: "2026-11-09T18:00:00Z" })), /Table\/payment changed/);
    await assert.rejects(() => commit(payment(), randomUUID(), 2), /Table\/payment changed/);
    assert.equal((await sql("SELECT * FROM sales")).length, 0);
  });
  test("database errors roll back both sale and outbox", async () => {
    await configure();
    await assert.rejects(() => commit(payment({ payment_method: "invalid" })), /check constraint/);
    assert.equal((await sql("SELECT * FROM sales")).length, 0);
    assert.equal((await sql("SELECT * FROM eet_transactions")).length, 0);
    assert.equal((await sql<{ eet_payment_revision: number }>("SELECT eet_payment_revision FROM tables"))[0].eet_payment_revision, 0);
  });
  test("partial refund creates a linked negative delta once, preserving original Data", async () => {
    await configure(); const sale = await commit();
    const before = (await sql<{ id: string; data: unknown }>("SELECT * FROM eet_transactions"))[0];
    await sql("UPDATE sales SET grand_total=140 WHERE id=$1", [sale.id]);
    await sql("UPDATE sales SET grand_total=140 WHERE id=$1", [sale.id]);
    const jobs = await sql<{ amount: string; parent_id: string; data: unknown; kind: string }>("SELECT * FROM eet_transactions ORDER BY revision");
    assert.equal(jobs.length, 2); assert.equal(jobs[1].amount, "-50.00"); assert.equal(jobs[1].parent_id, before.id);
    assert.equal(jobs[1].kind, "correction"); assert.deepEqual(jobs[0].data, before.data);
  });
  test("void creates a negative correction and cannot delete fiscal history", async () => {
    await configure(); const sale = await commit(); await sql("UPDATE sales SET deleted_at=now() WHERE id=$1", [sale.id]);
    const rows = await sql<{ amount: string }>("SELECT * FROM eet_transactions ORDER BY revision");
    assert.equal(rows.length, 2); assert.equal(rows[1].amount, "-180.00");
    await assert.rejects(() => sql("DELETE FROM sales WHERE id=$1", [sale.id]), /foreign key constraint/);
  });
  test("voucher and unresolved tip classifications remain durable but blocked", async () => {
    await configure("playground", "automatic", "review_required"); await commit();
    assert.match(String((await sql("SELECT * FROM eet_transactions"))[0].block_reason), /tips/);
    assert.equal(await claim(), undefined);
    await sql("UPDATE eet_settings SET tip_policy='employee_income'");
    const key = randomUUID(); await sql("UPDATE tables SET eet_settlement_key=NULL");
    await commit(payment({ voucher_discount_amount: 20, grand_total: 170 }), key, 1);
    assert.match(String((await sql("SELECT * FROM eet_transactions ORDER BY created_at DESC"))[0].block_reason), /Voucher/);
  });
  test("pausing and disabling preserve all jobs; new payments still captured after enablement", async () => {
    await configure(); const key = randomUUID(); await commit(payment(), key);
    await sql("UPDATE eet_settings SET submission_control='paused'"); assert.equal(await claim(), undefined);
    await sql("UPDATE eet_settings SET mode='disabled'"); await sql("SELECT eet_finish_settlement($1,$2)", [TABLE, key]);
    await commit(payment(), randomUUID(), 1);
    assert.equal((await sql("SELECT * FROM eet_transactions")).length, 2); assert.equal(await claim(), undefined);
  });
  test("one worker lease, stale completion fencing, and crash recovery with a NEW message UUID", async () => {
    await configure(); await commit(); const first = await claim(); assert.ok(first);
    assert.equal(await claim(), undefined); const firstAttempt = await attempt(first);
    await sql("UPDATE eet_transactions SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    assert.equal(await finish(first, firstAttempt.id, "accepted"), false);
    const recovered = await claim(); const secondAttempt = await attempt(recovered);
    assert.notEqual(secondAttempt.message_id, firstAttempt.message_id); assert.equal(secondAttempt.attempt_number, 2);
    assert.deepEqual(first.data, recovered.data);
    assert.equal((await sql("SELECT outcome FROM eet_attempts WHERE id=$1", [firstAttempt.id]))[0].outcome, "uncertain");
    assert.equal(await finish(recovered, secondAttempt.id, "accepted"), true);
  });
  test("retryable outages keep the sale completed and Data unchanged", async () => {
    await configure(); await commit(); const job = await claim(); const a = await attempt(job);
    await finish(job, a.id, "retrying"); const retried = await claim();
    assert.equal((await sql("SELECT * FROM sales")).length, 1); assert.deepEqual(retried.data, job.data);
  });
  test("correction waits for original acknowledgment and accepted records are immutable", async () => {
    await configure(); const sale = await commit(); await sql("UPDATE sales SET grand_total=140 WHERE id=$1", [sale.id]);
    const original = await claim(); const a = await attempt(original);
    assert.equal(await claim(), undefined); await finish(original, a.id, "accepted");
    const correction = await claim(); assert.notEqual(correction.id, original.id);
    await assert.rejects(() => sql("UPDATE eet_transactions SET status='retrying' WHERE id=$1", [original.id]), /immutable/);
    await assert.rejects(() => sql("UPDATE eet_transactions SET data='{}' WHERE id=$1", [correction.id]), /immutable/);
  });
  test("anon cannot read EET records, call privileged RPCs, or fabricate enabled fiscal payments", async () => {
    await configure(); await commit(); await db.exec("SET ROLE anon; SELECT set_config('request.jwt.claim.role','anon',false)");
    await assert.rejects(() => sql("SELECT * FROM eet_settings"), /permission denied/);
    await assert.rejects(() => sql("SELECT eet_claim($1)", [BUSINESS]), /permission denied/);
    await assert.rejects(() => sql("UPDATE sales SET grand_total=1"), /secure checkout/);
    await assert.rejects(() => sql("INSERT INTO sales(subtotal,grand_total,payment_method,items) VALUES(100,100,'cash','[]')"), /secure checkout/);
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false)");
  });
  test("optimistic settings writes require confirmation and keep live capture sticky", async () => {
    await configure();
    const value = { mode: "production", submission_control: "automatic", business_name: "SEOUL", establishment_address: "Prague", eic: "CZ00000019", unit_id: "11", register_id: "SEOUL-1", tip_policy: "employee_income" };
    await assert.rejects(() => sql("SELECT eet_save_settings($1,$2,1,$3,'')", [BUSINESS, STAFF, value]), /confirmation/);
    await sql("SELECT eet_save_settings($1,$2,1,$3,'ACTIVATE PRODUCTION')", [BUSINESS, STAFF, value]);
    await assert.rejects(() => sql("SELECT eet_save_settings($1,$2,1,$3,'ACTIVATE PRODUCTION')", [BUSINESS, STAFF, value]), /Settings changed/);
    value.mode = "disabled";
    await assert.rejects(() => sql("SELECT eet_save_settings($1,$2,2,$3,'')", [BUSINESS, STAFF, value]), /confirmation/);
    await sql("SELECT eet_save_settings($1,$2,2,$3,'STOP LIVE SUBMISSIONS')", [BUSINESS, STAFF, value]);
    const cfg = (await sql("SELECT * FROM eet_settings"))[0]; assert.equal(cfg.capture_environment, "production"); assert.ok(cfg.live_reporting_started_at);
  });
  test("overdue queue is visible without expiry or automatic deletion", async () => {
    await configure();
    await sql(`INSERT INTO sales(table_id,staff_id,subtotal,tip,grand_total,payment_method,items,closed_at)
      VALUES($1,$2,200,0,200,'cash','[]',now()-interval '49 hours')`, [TABLE, STAFF]);
    const stats = (await sql<{ value: { pending: number; errors: number } }>("SELECT eet_queue_health($1) AS value", [BUSINESS]))[0].value;
    assert.equal(stats.pending, 1); assert.equal(stats.errors, 0);
    assert.equal((await sql<{ value: { overdue: number } }>("SELECT eet_queue_health($1) AS value", [BUSINESS]))[0].value.overdue, 1);
  });
  test("Prague timestamps preserve local winter and summer time", async () => {
    const value = (await sql<{ winter: string; summer: string }>("SELECT eet_prague_time('2027-01-01T18:00:00Z') AS winter,eet_prague_time('2027-07-01T18:00:00Z') AS summer"))[0];
    assert.equal(value.winter, "2027-01-01T19:00:00+01:00"); assert.equal(value.summer, "2027-07-01T20:00:00+02:00");
  });
  test("secure History edits create correction and audit records atomically", async () => {
    await configure(); const sale = await commit();
    await sql("SELECT eet_adjust_sales($1,$2,$3,NULL,NULL,$4)", [BUSINESS, STAFF, [sale.id], { grand_total: 160 }]);
    assert.equal((await sql<{ amount: string }>("SELECT amount FROM eet_transactions ORDER BY revision DESC LIMIT 1"))[0].amount, "-30.00");
    assert.equal((await sql("SELECT * FROM eet_audit_logs WHERE action='history_payment_adjusted'")).length, 1);
    await assert.rejects(() => sql("SELECT eet_adjust_sales($1,$2,$3,NULL,NULL,$4)", [BUSINESS, STAFF, [sale.id, randomUUID()], { grand_total: 100 }]), /inaccessible/);
    assert.equal((await sql<{ grand_total: string }>("SELECT grand_total FROM sales WHERE id=$1", [sale.id]))[0].grand_total, "160.00");
  });
  test("dashboard totals and CSV source filters include corrections and isolate businesses", async () => {
    await configure(); const sale = await commit(); await sql("UPDATE sales SET grand_total=140 WHERE id=$1", [sale.id]);
    const stats = (await sql<{ result: { total: number; amount: string } }>("SELECT eet_dashboard_stats($1,now()-interval '1 day',now()+interval '1 day',NULL,'cash',NULL) AS result", [BUSINESS]))[0].result;
    assert.equal(stats.total, 2); assert.equal(stats.amount, "130.00");
    assert.equal((await sql("SELECT * FROM eet_export_rows($1,now()-interval '1 day',now()+interval '1 day',NULL,'cash',NULL,0)", [randomUUID()])).length, 0);
    assert.equal((await sql("SELECT * FROM eet_export_rows($1,now()-interval '1 day',now()+interval '1 day',NULL,'cash','SP-',0)", [BUSINESS])).length, 2);
  });
});
