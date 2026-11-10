import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { EET_NAMESPACE, assertAdminGrant, assertProductionAllowed, retryDelayMs, csvCell } from "../../src/lib/eet/policy";
import { assertCertificate, signSaleXml, parseEetResponse, parseXml, soapActionFromWsdl, SOAP_NS, DS_NS, WSSE_NS, WSU_NS, EXCLUSIVE, RSA_SHA256, SHA256 } from "../../src/lib/eet/xml";
import type { EetData } from "../../src/lib/eet/types";
import { eetReferralAuthorization, verifyEetReferralAuthorization } from "../../src/lib/eet/payment-service";

let key: string, certificate: string, directory: string;
before(() => {
  directory = mkdtempSync(join(tmpdir(), "eet2-test-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-subj", "/CN=CZ00000019", "-days", "3"], { stdio: "ignore" });
  key = readFileSync(join(directory, "key.pem"), "utf8"); certificate = readFileSync(join(directory, "cert.pem"), "utf8");
});
after(() => { rmSync(directory, { recursive: true, force: true }); });
const data: EetData = { eic_popl: "CZ00000019", id_jednotky: "11", id_pokl: "SEOUL-1", porad_cis: "SP-123", dat_trzby: "2026-11-10T19:00:00Z", celk_trzba: "180.00" };
const id = randomUUID();
function signedResponse(options: { messageId?: string; test?: boolean; pok?: string } = {}) {
  const xml = `<s:Envelope xmlns:s="${SOAP_NS}" xmlns:e="${EET_NAMESPACE}" xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}"><s:Header><wsse:Security/></s:Header><s:Body wsu:Id="reply"><e:Odpoved><e:Hlavicka uuid_zpravy="${options.messageId ?? id}" dat_prij="2026-11-10T19:00:01Z"/><e:Potvrzeni pok="${options.pok ?? `${randomUUID()}-${options.test === false ? "01" : "ff"}`}"${options.test === false ? "" : ' test="true"'}/></e:Odpoved></s:Body></s:Envelope>`;
  const signature = new SignedXml({ idMode: "wssecurity", privateKey: key, publicCert: certificate, signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: EXCLUSIVE });
  signature.addReference({ xpath: `//*[local-name()='Body' and namespace-uri()='${SOAP_NS}']`, transforms: [EXCLUSIVE], digestAlgorithm: SHA256 });
  signature.computeSignature(xml, { prefix: "ds", location: { reference: `//*[local-name()='Security']`, action: "append" } });
  return signature.getSignedXml();
}
function errorResponse(code: string) {
  return `<s:Envelope xmlns:s="${SOAP_NS}" xmlns:e="${EET_NAMESPACE}"><s:Body><e:Odpoved><e:Hlavicka uuid_zpravy="${id}"/><e:Chyba kod="${code}" test="true">Fixture error</e:Chyba></e:Odpoved></s:Body></s:Envelope>`;
}

test("WS-Security signs only SOAP Body using RSA-SHA256 / SHA256 / Exclusive C14N", () => {
  const xml = signSaleXml({ data, messageId: id, sentAt: "2026-11-10T19:00:00Z", first: true, certificate, privateKey: key });
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  assert.equal(doc.getElementsByTagNameNS(DS_NS, "Reference").length, 1);
  assert.equal(doc.getElementsByTagNameNS(WSSE_NS, "BinarySecurityToken").length, 1);
  const signature = new SignedXml({ idMode: "wssecurity", publicCert: certificate, getCertFromKeyInfo: () => null });
  signature.loadSignature(doc.getElementsByTagNameNS(DS_NS, "Signature").item(0)!.toString());
  assert.equal(signature.checkSignature(xml), true);
  assert.equal(signature.checkSignature(xml.replace('celk_trzba="180.00"', 'celk_trzba="1.00"')), false);
  assert.ok(Buffer.byteLength(xml) <= 12 * 1024);
  assert.doesNotMatch(xml, /PKP|BKP|fik|dic_popl/);
});
test("retry keeps all Data attributes frozen but gets a new message UUID and first=false", () => {
  const first = signSaleXml({ data, messageId: id, sentAt: "2026-11-10T19:00:00Z", first: true, certificate, privateKey: key });
  const secondId = randomUUID();
  const second = signSaleXml({ data, messageId: secondId, sentAt: "2026-11-10T19:01:00Z", first: false, certificate, privateKey: key });
  const a = parseXml(first).getElementsByTagNameNS(EET_NAMESPACE, "Data").item(0)!;
  const b = parseXml(second).getElementsByTagNameNS(EET_NAMESPACE, "Data").item(0)!;
  assert.equal(a.toString(), b.toString()); assert.match(second, /prvni_zaslani="false"/); assert.ok(second.includes(secondId));
});
test("a trusted signed POK is accepted; unsigned or modified POK is never accepted", () => {
  const xml = signedResponse(); const result = parseEetResponse(xml, id, "playground", [certificate]);
  assert.equal(result.kind, "accepted");
  assert.throws(() => parseEetResponse(xml.replace(/pok="[^"]+"/, `pok="${randomUUID()}-ff"`), id, "playground", [certificate]));
  assert.throws(() => parseEetResponse(xml.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/, ""), id, "playground", [certificate]));
  assert.throws(() => parseEetResponse(xml, id, "playground", []), /could not be verified/);
});
test("acknowledgments must match attempt UUID and environment", () => {
  assert.throws(() => parseEetResponse(signedResponse({ messageId: randomUUID() }), id, "playground", [certificate]), /UUID mismatch/);
  assert.throws(() => parseEetResponse(signedResponse(), id, "production", [certificate]), /environment mismatch/);
  assert.throws(() => parseEetResponse(signedResponse({ test: false, pok: `${randomUUID()}-ff` }), id, "production", [certificate]), /environment mismatch/);
});
test("XML wrapping, duplicate bodies, DTD/entity expansion and malformed XML are rejected", () => {
  const xml = signedResponse();
  assert.throws(() => parseEetResponse(xml.replace("</s:Envelope>", "<s:Body/></s:Envelope>"), id, "playground", [certificate]), /structure/);
  assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>'), /Unsafe/);
  assert.throws(() => parseXml("<a><b></a>"), /Malformed/);
});
test("official verification code 0 is connection success only, never a payment acknowledgment", () => {
  assert.equal(parseEetResponse(errorResponse("0"), id, "playground", [], true).kind, "verified");
  assert.throws(() => parseEetResponse(errorResponse("0"), id, "playground", []), /cannot acknowledge/);
  assert.deepEqual(parseEetResponse(errorResponse("-1"), id, "playground", []), { kind: "rejected", code: "-1", message: "Fixture error", retryable: true });
  assert.equal((parseEetResponse(errorResponse("4"), id, "playground", []) as { retryable: boolean }).retryable, false);
});
test("expired and wrong-identity certificates cannot sign", () => {
  assert.throws(() => assertCertificate(certificate, undefined, new Date("2100-01-01")), /not currently valid/);
  assert.throws(() => signSaleXml({ data: { ...data, eic_popl: "CZ11111111" }, messageId: id, sentAt: "2026-11-10T19:00:00Z", first: true, certificate, privateKey: key }), /EIČ/);
});
test("SOAPAction comes from a reviewed v4 WSDL; synthetic fixture is not an official artifact", () => {
  const fixture = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:s="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="${EET_NAMESPACE}"><binding><operation><s:operation soapAction="fixture-action"/></operation></binding></definitions>`;
  assert.equal(soapActionFromWsdl(fixture), "fixture-action");
  assert.throws(() => soapActionFromWsdl(fixture.replace("/v4", "/v3")), /v4/);
});
test("strict EET admin allowlist and explicit Production approval", () => {
  assert.throws(() => assertAdminGrant("server", "a", "a"), /permission/);
  assert.throws(() => assertAdminGrant("admin", "a", undefined), /permission/);
  assert.doesNotThrow(() => assertAdminGrant("admin", "a", "b,a"));
  assert.throws(() => assertProductionAllowed("production", {}), /locked/);
  assert.doesNotThrow(() => assertProductionAllowed("playground", {}));
  assert.doesNotThrow(() => assertProductionAllowed("production", { EET_PRODUCTION_APPROVED: "true", EET_COMPLIANCE_REVIEW_APPROVED: "true" }));
});
test("backoff is exponential and bounded; CSV cannot execute spreadsheet formulas", () => {
  assert.equal(retryDelayMs(1, 0.5), 5000); assert.equal(retryDelayMs(2, 0.5), 10000);
  assert.ok(retryDelayMs(100, 0.5) <= 3_600_000);
  assert.ok(retryDelayMs(100, 1) <= 3_600_000);
  assert.equal(csvCell(' =HYPERLINK("bad")'), '"\' =HYPERLINK(""bad"")"');
  assert.equal(csvCell("normal"), '"normal"');
  assert.equal(csvCell(-30), '"-30"');
});
test("public referral action cannot bypass the server-validated EET payment boundary", () => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "fixture-auth-secret-".repeat(3);
  try {
    const sale = { table_id: "table", grand_total: 180 };
    const intent = { key: randomUUID(), expectedVisit: "2026-11-10T19:00:00Z", expectedRevision: 0 };
    const proof = eetReferralAuthorization(sale, intent);
    assert.doesNotThrow(() => verifyEetReferralAuthorization(sale, intent, proof));
    assert.throws(() => verifyEetReferralAuthorization({ ...sale, grand_total: 1 }, intent, proof), /authorization failed/);
    assert.throws(() => verifyEetReferralAuthorization(sale, undefined, proof), /secure EET/);
    assert.throws(() => verifyEetReferralAuthorization(sale, intent, undefined), /secure EET/);
  } finally { if (old === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = old; }
});
