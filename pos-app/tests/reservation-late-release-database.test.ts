import assert from "node:assert/strict";
import { test, before, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let patch: string;
const business = randomUUID(), table = randomUUID(), second = randomUUID();
const fixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE businesses(id uuid PRIMARY KEY);
CREATE TABLE staff(id uuid PRIMARY KEY,business_id uuid,active boolean,role text);
CREATE TABLE settings(id integer PRIMARY KEY,business_id uuid,reservation_duration_minutes integer,reservation_buffer_minutes integer);
CREATE TABLE tables(id uuid PRIMARY KEY,label text,status text,availability_blocked boolean DEFAULT false,
 occupied_at timestamptz,orders jsonb,payment_status text,fulfillment_status text);
CREATE TABLE reservations(id uuid PRIMARY KEY,status text,party_size integer,reserved_at timestamptz,
 table_id uuid,secondary_table_id uuid,tertiary_table_id uuid,checked_in_at timestamptz,
 actual_party_size integer,updated_at timestamptz,staff_override_capacity boolean,capacity_warnings text);
SELECT set_config('request.jwt.claim.role','service_role',false);
`;
async function definition(file: string, name: string) {
  const text = await readFile(`supabase/${file}`, "utf8");
  const start = text.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`));
  assert.ok(start >= 0);
  const end = text.indexOf("\n$$;", start);
  assert.ok(end > start);
  return text.slice(start, end + 4);
}
async function booking(status: string, assigned: string | null = table) {
  const id = randomUUID();
  await db.query("INSERT INTO reservations(id,status,party_size,reserved_at,table_id) VALUES($1,$2,2,now()-interval '35 minutes',$3)", [id,status,assigned]);
  return id;
}
before(async () => {
  db = new PGlite(); await db.exec(fixture);
  await db.exec(await definition("patch-reservation-table-referral-scope.sql", "single_reservation_table_guard"));
  await db.exec(await definition("patch-live-table-availability.sql", "check_in_single_reservation"));
  await db.exec(await definition("patch-reservation-table-referral-scope.sql", "check_in_reservation_tables"));
  await db.exec(`CREATE TRIGGER single_reservation_table_guard BEFORE INSERT OR UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION single_reservation_table_guard();
    REVOKE ALL ON FUNCTION check_in_single_reservation(uuid,uuid,integer,integer,integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION check_in_single_reservation(uuid,uuid,integer,integer,integer) TO service_role;`);
  patch = await readFile("supabase/patch-reservation-late-release.sql", "utf8");
  await db.exec(patch);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE reservations,tables,settings,businesses;
    SELECT set_config('request.jwt.claim.role','service_role',false);
    INSERT INTO businesses VALUES('${business}');
    INSERT INTO settings VALUES(1,'${business}',90,0);
    INSERT INTO tables(id,label,status) VALUES('${table}','D2','empty'),('${second}','D3','empty');`);
});

test("patch is idempotent and preserves record data, security settings and function permissions", async () => {
  const id = await booking("late");
  const beforeRows = (await db.query("SELECT * FROM reservations WHERE id=$1", [id])).rows;
  const security = (await db.query("SELECT oid,prosecdef,proconfig,proacl FROM pg_proc WHERE proname LIKE '%reservation%' ORDER BY oid")).rows;
  await db.exec(patch); await db.exec(patch);
  assert.deepEqual((await db.query("SELECT * FROM reservations WHERE id=$1", [id])).rows, beforeRows);
  assert.deepEqual((await db.query("SELECT oid,prosecdef,proconfig,proacl FROM pg_proc WHERE proname LIKE '%reservation%' ORDER BY oid")).rows, security);
});

test("marking a booking Late frees its assigned slot without deleting its planned table", async () => {
  const id = await booking("confirmed");
  await assert.rejects(booking("confirmed"), /reserved/);
  await db.query("UPDATE reservations SET status='late' WHERE id=$1", [id]);
  await booking("confirmed");
  const row = (await db.query<{ status: string; table_id: string }>("SELECT status,table_id FROM reservations WHERE id=$1", [id])).rows[0];
  assert.equal(row.status, "late"); assert.equal(row.table_id, table);
  await assert.rejects(db.query("UPDATE reservations SET status='confirmed' WHERE id=$1", [id]), /reserved/);
});

test("single-table check-in ignores another Late booking while retaining Late arrival eligibility", async () => {
  await booking("late");
  const arriving = await booking("late");
  await db.query("SELECT check_in_single_reservation($1,$2,2,90,0)", [arriving,table]);
  assert.equal((await db.query<{ status: string }>("SELECT status FROM reservations WHERE id=$1", [arriving])).rows[0].status, "checked_in");
  assert.equal((await db.query<{ status: string }>("SELECT status FROM tables WHERE id=$1", [table])).rows[0].status, "waiting");
});

test("multi-table check-in ignores Late holds on both physical tables", async () => {
  await booking("late", table); await booking("late", second);
  const arriving = await booking("late", null);
  await db.query("SELECT check_in_reservation_tables($1,$2::uuid[],4,$3,NULL,false,NULL)", [arriving,[table,second],business]);
  const row = (await db.query<{ status: string; table_id: string; secondary_table_id: string }>("SELECT status,table_id,secondary_table_id FROM reservations WHERE id=$1", [arriving])).rows[0];
  assert.equal(row.status, "checked_in"); assert.equal(row.table_id, table); assert.equal(row.secondary_table_id, second);
});

test("occupied tables, active checked-in guests and unauthorized check-ins remain protected", async () => {
  const arriving = await booking("late");
  await db.query("UPDATE tables SET status='waiting' WHERE id=$1", [table]);
  await assert.rejects(db.query("SELECT check_in_single_reservation($1,$2,2,90,0)", [arriving,table]), /occupied/);
  await db.query("UPDATE tables SET status='empty' WHERE id=$1", [table]);
  const seated = await booking("checked_in");
  await db.query("UPDATE reservations SET checked_in_at=now() WHERE id=$1", [seated]);
  await assert.rejects(db.query("SELECT check_in_single_reservation($1,$2,2,90,0)", [arriving,table]), /checked-in|reserved|current visit/);
  await db.exec("SELECT set_config('request.jwt.claim.role','anon',false)");
  await assert.rejects(db.query("SELECT check_in_single_reservation($1,$2,2,90,0)", [arriving,table]), /authorization/);
});

test("patch also updates the older deployed single-table guard without replacing its other rules", async () => {
  await db.exec(await definition("patch-live-table-availability.sql", "single_reservation_table_guard"));
  await db.exec(patch);
  await booking("late"); await booking("confirmed");
  await assert.rejects(booking("confirmed"), /reserved/);
});
