/* eslint-disable @typescript-eslint/no-require-imports -- Exercise actual server boundaries with isolated DB/cookie adapters. */
const assert = require("node:assert/strict");
const { beforeEach, after, test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function compile(relative, overrides = {}) {
  const file = path.join(root, relative), mod = new Module(file, module);
  mod.require = request => Object.hasOwn(overrides, request) ? overrides[request] : require(request);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod.exports;
}
const env = { AUTH_SECRET: process.env.AUTH_SECRET, EET_ADMIN_STAFF_IDS: process.env.EET_ADMIN_STAFF_IDS };
const businessId = "10000000-0000-4000-a000-000000000001", staffId = "20000000-0000-4000-a000-000000000001";
let state;
const jar = { get: key => state.cookies[key], set: (key, value, options) => { state.cookies[key] = { value, options }; }, delete: key => delete state.cookies[key] };
const db = {
  from(table) {
    const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { admin_deletion_password: state.code }, error: null }; },
      async single() { return { data: { id: state.staffId, role: state.role, active: true, business_id: businessId }, error: null }; },
      async insert(row) { state.audit.push(row); return { error: state.auditError ? {} : null }; } };
    assert.ok(["staff", "settings", "eet_audit_logs"].includes(table));
    return query;
  },
  async rpc(name) { assert.equal(name, "eet_manager_unlock_attempt"); state.attempts++; return { data: state.permitted, error: state.migrationMissing ? {} : null }; },
};
const dbModule = { eetDb: () => db, requireEetBusinessId: () => businessId };
const tokens = compile("src/lib/eet/manager-token.ts");
const sessions = compile("src/lib/eet/manager-session.ts", { "server-only": {}, "next/headers": { cookies: async () => jar }, "@/src/lib/auth/staff-session-token": { STAFF_COOKIE_NAME: "pos_staff" }, "./db": dbModule, "./manager-token": tokens });
const policy = compile("src/lib/eet/policy.ts");
const auth = compile("src/lib/eet/auth.ts", { "server-only": {}, "@/src/lib/auth/session": { readAuthSession: async () => ({ businessId }) }, "@/src/lib/auth/staff-session": { readStaffSession: async () => ({ businessId: state.businessId, staffId: state.staffId }) }, "./policy": policy, "./db": dbModule, "./manager-session": sessions });
const diagnostics = compile("src/lib/eet/setup-diagnostics.ts");
const actions = compile("src/lib/eet/workspace-actions.ts", { "./auth": auth, "./manager-session": sessions, "./setup-diagnostics": diagnostics,
  "./material-crypto": { materialEncryptionReady: () => true }, "./setup-guide": { getEetSetupScripts: async () => [] },
  "./actions": { getEetSettingsAction: async () => { await auth.eetActor(true); state.reads++; return { marker: "authorized-metadata" }; } },
});
beforeEach(() => {
  process.env.AUTH_SECRET = "fixture-only-strong-auth-secret-32-characters"; process.env.EET_ADMIN_STAFF_IDS = staffId;
  state = { businessId, staffId, role: "admin", code: "fixture-manager-code", permitted: true, attempts: 0, audit: [], reads: 0, cookies: { pos_staff: { value: "signed-staff-session-fixture" } } };
});
after(() => { for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

test("even an allowlisted admin is denied EET access before manager-code verification", async () => {
  await assert.rejects(() => auth.eetActor(true), /manager code/);
  assert.equal((await actions.getEetWorkspaceAction()).state, "locked"); assert.equal(state.reads, 0);
  assert.equal((await actions.unlockEetWorkspaceAction("wrong")).ok, false);
  await assert.rejects(() => auth.eetActor(true), /manager code/); assert.equal(state.attempts, 1);
});
test("valid manager code issues an HttpOnly short session and unlocks only authorized metadata", async () => {
  assert.equal((await actions.unlockEetWorkspaceAction(state.code)).ok, true);
  const cookie = state.cookies.pos_eet_manager;
  assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.sameSite, "strict"); assert.equal(cookie.options.maxAge, 600);
  assert.ok(!cookie.value.includes(state.code));
  assert.equal((await actions.getEetWorkspaceAction()).state, "ready"); assert.equal(state.reads, 1);
  assert.ok(!JSON.stringify(state.audit).includes(state.code));
  await actions.lockEetWorkspaceAction(); await assert.rejects(() => auth.eetActor(true), /manager code/);
});
test("code rotation, staff-session change, expiry and tampering invalidate server access", async () => {
  await actions.unlockEetWorkspaceAction(state.code);
  const original = state.cookies.pos_eet_manager.value;
  state.code += "-rotated"; await assert.rejects(() => auth.eetActor(true), /manager code/); state.code = "fixture-manager-code";
  state.cookies.pos_staff.value += "-switched"; await assert.rejects(() => auth.eetActor(true), /manager code/); state.cookies.pos_staff.value = "signed-staff-session-fixture";
  state.cookies.pos_eet_manager.value = original + "tampered"; await assert.rejects(() => auth.eetActor(true), /manager code/);
  const expected = { businessId, staffId, sessionHash: tokens.managerFingerprint(state.cookies.pos_staff.value), codeHash: tokens.managerFingerprint(state.code) };
  assert.equal(tokens.decodeManagerGrant(tokens.encodeManagerGrant({ ...expected, expiresAt: Date.now() - 1 }), expected), null);
});
test("manager code cannot bypass staff allowlist or role checks; configured managers can unlock", async () => {
  state.role = "server"; assert.equal((await actions.unlockEetWorkspaceAction(state.code)).ok, false); assert.equal(state.attempts, 0);
  state.role = "manager"; process.env.EET_ADMIN_STAFF_IDS = "different-staff"; assert.equal((await actions.unlockEetWorkspaceAction(state.code)).ok, false);
  process.env.EET_ADMIN_STAFF_IDS = staffId; assert.equal((await actions.unlockEetWorkspaceAction(state.code)).ok, true); await auth.eetActor(true);
  state.businessId = "different-business"; await assert.rejects(() => auth.eetActor(true), /business and staff/);
});
test("persistent rate limit, missing migration and audit failures never issue a grant", async () => {
  for (const field of ["permitted", "migrationMissing", "auditError"]) {
    state.permitted = field !== "permitted"; state.migrationMissing = field === "migrationMissing"; state.auditError = field === "auditError";
    assert.equal((await actions.unlockEetWorkspaceAction(state.code)).ok, false); assert.equal(state.cookies.pos_eet_manager, undefined);
  }
  state.code = null; await assert.rejects(() => sessions.managerCode(businessId), /Configure a manager code/);
});
