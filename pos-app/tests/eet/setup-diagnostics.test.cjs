/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the server page with isolated server boundaries. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const root = path.resolve(__dirname, "../..");
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
test("unknown errors never expose raw server or credential details", () => {
  for (const error of [new Error("https://secret:password@example.test?token=private"), "private-key", null, new Error("__proto__")]) {
    const result = describeEetSetupFailure(error);
    assert.equal(result.code, "EET_SETUP_UNAVAILABLE");
    assert.ok(!JSON.stringify(result).includes("password@example"));
    assert.ok(!JSON.stringify(result).includes("private-key"));
  }
});
test("database and manager failures produce distinct static recovery instructions", () => {
  for (const [message, code] of [["EET queue health query unavailable.", "EET_QUEUE_HEALTH"], ["EET audit query unavailable.", "EET_AUDIT_DATABASE"], ["Enter the manager code to unlock EET settings.", "EET_MANAGER_LOCKED"]]) {
    assert.equal(describeEetSetupFailure(new Error(message)).code, code);
  }
});
test("legacy Admin routes redirect into the POS manager gate", () => {
  for (const relative of ["app/admin/eet/page.tsx", "app/admin/settings/eet/page.tsx"]) {
    const Page = compile(relative, { "next/navigation": { redirect: destination => { throw new Error(destination); } } }).default;
    assert.throws(() => Page(), { message: "/app/eet" });
  }
});
