import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encryptMaterial, decryptMaterial, type EncryptedMaterial } from "../../src/lib/eet/material-crypto";
import { parsePkcs12, validateProtocol, validateResponseCertificates, validateSigner } from "../../src/lib/eet/material-validation";
import { EET_NAMESPACE } from "../../src/lib/eet/policy";

let dir: string, certificate: string, privateKey: string, responseCertificate: string, bundle: Buffer;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "eet-import-test-"));
  for (const [name, subject] of [["register", "CZ00000019"], ["response", "TaxAuthorityFixture"]]) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.crt`), "-subj", `/CN=${subject}`, "-days", "3", "-addext", "basicConstraints=critical,CA:FALSE"], { stdio: "ignore" });
  }
  execFileSync("openssl", ["pkcs12", "-export", "-inkey", join(dir, "register.key"), "-in", join(dir, "register.crt"), "-out", join(dir, "register.p12"), "-passout", "pass:fixture-password"], { stdio: "ignore" });
  certificate = readFileSync(join(dir, "register.crt"), "utf8"); privateKey = readFileSync(join(dir, "register.key"), "utf8");
  responseCertificate = readFileSync(join(dir, "response.crt"), "utf8"); bundle = readFileSync(join(dir, "register.p12"));
});
after(() => rmSync(dir, { recursive: true, force: true }));

test("AEAD encryption hides plaintext and rejects ciphertext/tag tampering", () => {
  const key = randomBytes(32).toString("base64");
  const scope = { businessId: "business-a", environment: "playground" as const, kind: "signer" as const };
  const material = { privateKey: "never-in-audit-or-client-fixture", certificate: "fixture" };
  const encrypted = encryptMaterial(scope, material, key);
  assert.ok(!JSON.stringify(encrypted).includes(material.privateKey));
  assert.deepEqual(decryptMaterial(scope, encrypted, key), material);
  const mutated = { ...encrypted, ciphertext: `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}` };
  assert.throws(() => decryptMaterial(scope, mutated, key), /could not be decrypted/);
  assert.throws(() => decryptMaterial(scope, { ...encrypted, tag: randomBytes(16).toString("base64") }, key), /could not be decrypted/);
  assert.throws(() => decryptMaterial(scope, encrypted, randomBytes(32).toString("base64")), /could not be decrypted/);
});
test("encrypted material cannot be moved between businesses, environments or kinds", () => {
  const key = randomBytes(32).toString("base64");
  const scope = { businessId: "business-a", environment: "playground" as const, kind: "signer" as const };
  const encrypted = encryptMaterial(scope, { privateKey: "fixture" }, key);
  for (const other of [{ ...scope, businessId: "business-b" }, { ...scope, environment: "production" as const }, { ...scope, kind: "response" as const }]) {
    assert.throws(() => decryptMaterial(other, encrypted, key), /could not be decrypted/);
  }
  const second = encryptMaterial(scope, { privateKey: "fixture" }, key);
  assert.notEqual(encrypted.iv, second.iv); assert.notEqual(encrypted.ciphertext, second.ciphertext);
});
test("invalid encryption configuration and oversized material fail closed", () => {
  const scope = { businessId: "a", environment: "shared" as const, kind: "protocol" as const };
  assert.throws(() => encryptMaterial(scope, {}, "short"), /encryption key/);
  assert.throws(() => encryptMaterial(scope, "x".repeat(300_000), randomBytes(32).toString("base64")), /too large/);
  assert.throws(() => decryptMaterial(scope, { v: 2 } as unknown as EncryptedMaterial, randomBytes(32).toString("base64")), /could not be decrypted/);
});
test("real PKCS#12 import checks password/MAC and finds the matching register leaf", () => {
  const material = parsePkcs12(bundle, "fixture-password");
  assert.equal(validateSigner(material).eic, "CZ00000019");
  assert.throws(() => parsePkcs12(bundle, "wrong-password"));
  assert.throws(() => parsePkcs12(Buffer.from("not a PFX file"), "fixture-password"));
  assert.throws(() => parsePkcs12(Buffer.alloc(129 * 1024), "fixture-password"), /size/);
});
test("PEM imports require valid matching register key/certificate and EIČ", () => {
  assert.equal(validateSigner({ certificate, privateKey }).eic, "CZ00000019");
  assert.throws(() => validateSigner({ certificate, privateKey: readFileSync(join(dir, "response.key"), "utf8") }), /does not match/);
  assert.throws(() => validateSigner({ certificate: responseCertificate, privateKey: readFileSync(join(dir, "response.key"), "utf8") }), /EIČ/);
});
test("response trust imports reject taxpayer certificates and invalid material", () => {
  assert.equal(validateResponseCertificates(responseCertificate).certificates.length, 1);
  assert.throws(() => validateResponseCertificates(certificate), /tax-authority/);
  assert.throws(() => validateResponseCertificates(`${responseCertificate}<script>bad()</script>`), /only/);
  assert.throws(() => validateResponseCertificates("x".repeat(70_000)), /maximum/);
});
test("protocol paste/upload validates v4 XML and computes checksums without executing scripts", () => {
  const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:s="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="${EET_NAMESPACE}"><binding><operation><s:operation soapAction="fixture-only"/></operation></binding></definitions>`;
  const xsd = `<x:schema xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="${EET_NAMESPACE}"/>`;
  const parsed = validateProtocol(wsdl, xsd);
  assert.match(parsed.wsdlSha256, /^[a-f0-9]{64}$/); assert.match(parsed.xsdSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => validateProtocol(wsdl, xsd.replace("/v4", "/v3")), /v4/);
  assert.throws(() => validateProtocol("<script>execute()</script>", xsd));
  assert.throws(() => validateProtocol(wsdl, '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>'), /Unsafe/);
});
