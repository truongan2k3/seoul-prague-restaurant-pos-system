/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the server page with isolated server boundaries. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const root = path.resolve(__dirname, "../..");
let failure = null, snapshot = null, encryptionReady = true;
const SettingsPanel = () => null, SetupGuide = () => null, MaterialsPanel = () => null;
function compile(relative, overrides = {}) {
  const file = path.join(root, relative);
  const mod = new Module(file, module);
  mod.require = request => Object.hasOwn(overrides, request) ? overrides[request] : require(request);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, file);
  return mod.exports;
}
const diagnostics = compile("src/lib/eet/setup-diagnostics.ts");
const { describeEetSetupFailure } = diagnostics;
const Page = compile("app/admin/settings/eet/page.tsx", {
  "@/components/eet/settings-panel": { EetSettingsPanel: SettingsPanel },
  "@/components/eet/setup-guide": { EetSetupGuide: SetupGuide },
  "@/components/eet/materials-panel": { EetMaterialsPanel: MaterialsPanel },
  "@/src/lib/eet/actions": { getEetSettingsAction: async () => { if (failure) throw failure; return snapshot; } },
  "@/src/lib/eet/setup-guide": { getEetSetupScripts: async () => [] },
  "@/src/lib/eet/material-crypto": { materialEncryptionReady: () => encryptionReady },
  "@/src/lib/eet/setup-diagnostics": diagnostics,
}).default;

test("unknown errors never expose raw server or credential details", () => {
  for (const error of [new Error("https://secret:password@example.test?token=private"), "private-key", null, new Error("__proto__")]) {
    const result = describeEetSetupFailure(error);
    assert.equal(result.code, "EET_SETUP_UNAVAILABLE");
    assert.ok(!JSON.stringify(result).includes("password@example"));
    assert.ok(!JSON.stringify(result).includes("private-key"));
  }
});
test("fallback preserves accepted encryption status while keeping uploads locked for an admin failure", async () => {
  failure = new Error("EET administrator permission required."); encryptionReady = true;
  const element = await Page();
  const children = element.props.children;
  const materials = children.find(child => child.type === MaterialsPanel);
  assert.equal(materials.props.encryptionReady, true);
  assert.equal(materials.props.overview.storageReady, false);
  assert.match(materials.props.setupBlockedReason, /EET_ADMIN_PERMISSION/);
  assert.match(JSON.stringify(children[1].props), /Configured — keep the existing value/);
  assert.equal(children.find(child => child.type === SetupGuide).props.encryptionConfigured, true);
});
test("database failures identify their stage separately from encryption readiness", async () => {
  for (const [message, code] of [["EET queue health query unavailable.", "EET_QUEUE_HEALTH"], ["EET audit query unavailable.", "EET_AUDIT_DATABASE"], ["EET material status unavailable.", "EET_MATERIAL_DATABASE"]]) {
    failure = new Error(message); encryptionReady = false;
    const element = await Page();
    const materials = element.props.children.find(child => child.type === MaterialsPanel);
    assert.equal(materials.props.encryptionReady, false);
    assert.match(materials.props.setupBlockedReason, new RegExp(code));
  }
});
test("successful settings checks retain the existing settings workflow", async () => {
  failure = null; snapshot = { fixture: "authorized-settings" };
  const element = await Page();
  assert.equal(element.type, SettingsPanel);
  assert.equal(element.props.initial, snapshot);
});
