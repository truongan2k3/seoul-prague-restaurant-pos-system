/* eslint-disable @typescript-eslint/no-require-imports -- Execute actual import actions with authenticated server/DB boundaries stubbed. */
const assert = require("node:assert/strict");
const { before, beforeEach, after, test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const Module = require("node:module"), ts = require("typescript");
const root = path.resolve(__dirname, "../.."), resolve = Module._resolveFilename, load = Module._load;
const names = ["EET_SETTINGS_ENCRYPTION_KEY", "EET_PROTOCOL_REVIEWED", "EET_PRODUCTION_APPROVED", "EET_COMPLIANCE_REVIEW_APPROVED"];
const previousEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const businessId = "10000000-0000-4000-a000-000000000001";
let state, dir, certificate, privateKey, bundle, responseCertificate;
Module._resolveFilename = function (request, ...args) { return resolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, ...args); };
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "./auth" && parent.filename.endsWith("eet/material-actions.ts")) return { eetActor: async admin => {
    if (!state.authorized || !admin) throw new Error("EET administrator permission required.");
    return { businessId, staff: { id: "admin-id" }, db: {
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: state.settings, error: null }) }; },
      rpc: async (name, args) => {
        assert.equal(name, "eet_save_material"); state.writes++;
        if (state.stale) return { error: { message: "EET material changed. Reload before replacing" } };
        state.saved[`${args.p_environment}:${args.p_kind}`] = { businessId, environment: args.p_environment, kind: args.p_kind, envelope: args.p_envelope };
        state.lastArgs = args; return { error: null };
      },
    } };
  } };
  if (request === "./material-store" && parent.filename.endsWith("eet/credentials.ts")) return {
    getStoredMaterial: async (env, kind) => state.saved[`${env}:${kind}`] ?? null,
    decryptStoredMaterial: record => crypto.decryptMaterial({ businessId: record.businessId, environment: record.environment, kind: record.kind }, record.envelope),
  };
  return load.call(this, request, parent, isMain);
};
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const crypto = require("../../src/lib/eet/material-crypto.ts");
const actions = require("../../src/lib/eet/material-actions.ts");
const { loadCredentials, certificateStatus } = require("../../src/lib/eet/credentials.ts");
const { EET_NAMESPACE } = require("../../src/lib/eet/policy.ts");
const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:s="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="${EET_NAMESPACE}"><binding><operation><s:operation soapAction="fixture-only"/></operation></binding></definitions>`;
const xsd = `<x:schema xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="${EET_NAMESPACE}"/>`;
function form(values) { const data = new FormData(); for (const [name, value] of Object.entries(values)) data.set(name, value); return data; }
function signer(env = "playground") { return form({ environment: env, version: "0", format: "pkcs12", password: "fixture-password", bundle: new File([bundle], "fixture.p12") }); }
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "eet-import-action-"));
  for (const [name, subject] of [["register", "CZ00000019"], ["response", "TaxAuthorityFixture"]]) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, `${name}.key`), "-out", path.join(dir, `${name}.crt`), "-subj", `/CN=${subject}`, "-days", "3", "-addext", "basicConstraints=critical,CA:FALSE"], { stdio: "ignore" });
  }
  execFileSync("openssl", ["pkcs12", "-export", "-inkey", path.join(dir, "register.key"), "-in", path.join(dir, "register.crt"), "-out", path.join(dir, "register.p12"), "-passout", "pass:fixture-password"], { stdio: "ignore" });
  certificate = fs.readFileSync(path.join(dir, "register.crt"), "utf8"); privateKey = fs.readFileSync(path.join(dir, "register.key"), "utf8");
  responseCertificate = fs.readFileSync(path.join(dir, "response.crt"), "utf8"); bundle = fs.readFileSync(path.join(dir, "register.p12"));
});
beforeEach(() => {
  state = { authorized: true, writes: 0, saved: {}, stale: false, settings: { mode: "disabled", capture_environment: null, eic: "" } };
  process.env.EET_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); process.env.EET_PROTOCOL_REVIEWED = "true";
  process.env.EET_PRODUCTION_APPROVED = "false"; process.env.EET_COMPLIANCE_REVIEW_APPROVED = "false";
});
after(() => {
  fs.rmSync(dir, { recursive: true, force: true }); Module._resolveFilename = resolve; Module._load = load;
  for (const name of names) { if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name]; }
});
test("unauthorized uploads are rejected before parsing or writes", async () => {
  state.authorized = false;
  await assert.rejects(() => actions.importEetSignerAction(signer()), /administrator/); assert.equal(state.writes, 0);
});
test("P12 import stores encrypted normalized key, discards password, returns no secret", async () => {
  const result = await actions.importEetSignerAction(signer());
  assert.equal(state.writes, 1); assert.equal(state.lastArgs.p_metadata.eic, "CZ00000019");
  const visible = JSON.stringify({ result, metadata: state.lastArgs.p_metadata, envelope: state.lastArgs.p_envelope });
  assert.ok(!visible.includes("fixture-password")); assert.ok(!visible.includes("BEGIN PRIVATE KEY"));
  const stored = state.saved["playground:signer"];
  const payload = crypto.decryptMaterial({ businessId, environment: "playground", kind: "signer" }, stored.envelope);
  assert.ok(payload.privateKey.includes("BEGIN PRIVATE KEY")); assert.equal(payload.passphrase, undefined);
  assert.deepEqual(Object.keys(result), ["message"]);
});
test("bad password, oversized upload and corrupt private key are safe errors with no write", async () => {
  const wrong = signer(); wrong.set("password", "sensitive-wrong-password");
  await assert.rejects(() => actions.importEetSignerAction(wrong), error => /Certificate import failed/.test(error.message) && !error.message.includes("sensitive-wrong-password"));
  const big = signer(); big.set("bundle", new File([Buffer.alloc(129 * 1024)], "large.p12"));
  await assert.rejects(() => actions.importEetSignerAction(big), /Certificate import failed/);
  await assert.rejects(() => actions.importEetSignerAction(form({ environment: "playground", version: "0", format: "pem", certificate, privateKey: "sensitive-invalid-private-key", password: "" })), error => !error.message.includes("sensitive-invalid-private-key"));
  assert.equal(state.writes, 0);
});
test("PEM upload works and certificate EIČ cannot replace an active different identity", async () => {
  const pem = form({ environment: "playground", version: "0", format: "pem", certificate, privateKey, password: "" });
  await actions.importEetSignerAction(pem); assert.equal(state.writes, 1);
  state.settings = { capture_environment: "playground", eic: "CZ99999999" };
  await assert.rejects(() => actions.importEetSignerAction(pem), /differs from the active/); assert.equal(state.writes, 1);
});
test("protocol accepts paste or UTF8 files, hashes automatically, rejects mixed sources/scripts", async () => {
  await actions.importEetProtocolAction(form({ wsdl, xsd, sourceReviewed: "on", version: "0" }));
  assert.match(state.lastArgs.p_metadata.wsdlSha256, /^[a-f0-9]{64}$/);
  await actions.importEetProtocolAction(form({ wsdlFile: new File([wsdl], "official.wsdl"), xsdFile: new File([xsd], "official.xsd"), sourceReviewed: "on", version: "0" }));
  await assert.rejects(() => actions.importEetProtocolAction(form({ wsdl, wsdlFile: new File([wsdl], "x.wsdl"), xsd, sourceReviewed: "on", version: "0" })), /Import failed/);
  await assert.rejects(() => actions.importEetProtocolAction(form({ wsdl: "<script>execute()</script>", xsd, sourceReviewed: "on", version: "0" })), /not accepted/);
  assert.equal(state.writes, 2);
});
test("worker reads imported materials and certificate status exposes metadata only", async () => {
  await actions.importEetProtocolAction(form({ wsdl, xsd, sourceReviewed: "on", version: "0" })); await actions.importEetSignerAction(signer());
  await actions.importEetResponseCertificatesAction(form({ environment: "playground", version: "0", trustReviewed: "on", responseCertificates: responseCertificate }));
  const credentials = await loadCredentials("playground", "CZ00000019");
  assert.equal(credentials.soapAction, "fixture-only"); assert.ok(credentials.privateKey.includes("BEGIN PRIVATE KEY"));
  const status = await certificateStatus("playground"); assert.equal(status.source, "pos"); assert.equal(status.valid, true);
  assert.ok(!JSON.stringify(status).includes("BEGIN CERTIFICATE")); assert.ok(!JSON.stringify(status).includes("privateKey"));
  process.env.EET_PROTOCOL_REVIEWED = "false";
  await assert.rejects(() => loadCredentials("playground", "CZ00000019"), /Review and pin/);
  assert.ok((await loadCredentials("playground", "CZ00000019", { verification: true })).privateKey);
});
test("Production material can be prepared without activating live reporting; load remains locked", async () => {
  await actions.importEetSignerAction(signer("production"));
  assert.equal(state.settings.mode, "disabled"); assert.ok(state.saved["production:signer"]); assert.equal(state.saved["playground:signer"], undefined);
  await assert.rejects(() => loadCredentials("production", "CZ00000019"), /Production is locked/);
});
test("missing encryption key and stale versions do not overwrite saved material", async () => {
  delete process.env.EET_SETTINGS_ENCRYPTION_KEY;
  await assert.rejects(() => actions.importEetSignerAction(signer()), /encryption key/); assert.equal(state.writes, 0);
  process.env.EET_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); state.stale = true;
  await assert.rejects(() => actions.importEetSignerAction(signer()), /Reload Settings/); assert.equal(Object.keys(state.saved).length, 0);
});
