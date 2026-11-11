import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { validateIcaAuthorities, verifyResponseCertificateChain, certificateCrlUrls } from "../../src/lib/eet/response-chain";
import { verifyCertificateRevocation } from "../../src/lib/eet/response-revocation";
import { EET_RESPONSE_AUTHORITIES } from "../../src/lib/eet/response-authorities";

let dir: string, root: string, issuer: string, leaf: string, emptyCrl: Buffer, revokedCrl: Buffer;
const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });
before(() => {
  dir = mkdtempSync(join(tmpdir(), "eet-response-chain-"));
  openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "root.key", "-out", "root.pem", "-subj", "/CN=Fixture Root", "-days", "3", "-addext", "basicConstraints=critical,CA:TRUE,pathlen:1", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  // Real I.CA organization names contain Czech UTF-8. Include a multi-value RDN
  // too: reconstructing a flattened parsed DN must not be used for CRL matching.
  openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-utf8", "-keyout", "issuer.key", "-out", "issuer.csr", "-subj", "/C=CZ/O=První certifikační autorita, a.s./CN=Fixture Issuer+OU=Signing CA");
  writeFileSync(join(dir, "issuer.ext"), "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\ncrlDistributionPoints=URI:http://qcrldp1.ica.cz/fixture-root.crl\n");
  openssl("x509", "-req", "-in", "issuer.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-out", "issuer.pem", "-days", "3", "-extfile", "issuer.ext");
  openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=Fixture Tax Authority");
  writeFileSync(join(dir, "index"), ""); writeFileSync(join(dir, "serial"), "1000\n"); writeFileSync(join(dir, "crlnumber"), "1000\n");
  writeFileSync(join(dir, "ca.conf"), `[ca]\ndefault_ca=issuer\n[issuer]\ndatabase=${dir}/index\nnew_certs_dir=${dir}\nserial=${dir}/serial\ncrlnumber=${dir}/crlnumber\ncertificate=${dir}/issuer.pem\nprivate_key=${dir}/issuer.key\ndefault_md=sha256\ndefault_days=2\ndefault_crl_days=1\npolicy=policy\nx509_extensions=leaf\n[policy]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\ncrlDistributionPoints=URI:http://qcrldp1.ica.cz/fixture-issuer.crl\n`);
  openssl("ca", "-config", "ca.conf", "-in", "leaf.csr", "-out", "leaf.pem", "-batch", "-notext");
  openssl("ca", "-config", "ca.conf", "-gencrl", "-out", "empty.crl"); openssl("crl", "-in", "empty.crl", "-outform", "DER", "-out", "empty.der");
  openssl("ca", "-config", "ca.conf", "-revoke", "leaf.pem", "-crl_reason", "keyCompromise");
  openssl("ca", "-config", "ca.conf", "-gencrl", "-out", "revoked.crl"); openssl("crl", "-in", "revoked.crl", "-outform", "DER", "-out", "revoked.der");
  root = readFileSync(join(dir, "root.pem"), "utf8"); issuer = readFileSync(join(dir, "issuer.pem"), "utf8"); leaf = readFileSync(join(dir, "leaf.pem"), "utf8");
  emptyCrl = readFileSync(join(dir, "empty.der")); revokedCrl = readFileSync(join(dir, "revoked.der"));
});
after(() => rmSync(dir, { recursive: true, force: true }));
test("a valid RSA leaf chain verifies but substituted, expired and CA signers fail", () => {
  assert.equal(verifyResponseCertificateChain(leaf, root, issuer).ca, false);
  assert.throws(() => verifyResponseCertificateChain(leaf, root, root));
  assert.throws(() => verifyResponseCertificateChain(issuer, root, issuer));
  assert.throws(() => verifyResponseCertificateChain(leaf, root, issuer, new Date("2100-01-01")));
});
test("only independently published I.CA authorities can become response trust anchors", () => {
  assert.throws(() => validateIcaAuthorities([root, issuer]), /fingerprint/);
  assert.throws(() => validateIcaAuthorities([root]), /both official/);
  assert.ok(EET_RESPONSE_AUTHORITIES.every(authority => /^[0-9a-f]{64}$/.test(authority.sha256)));
  assert.deepEqual(certificateCrlUrls(new X509Certificate(leaf)), ["http://qcrldp1.ica.cz/fixture-issuer.crl"]);
});
test("signed fresh CRLs permit an unrevoked leaf and reject revoked, stale, modified or wrongly issued data", () => {
  const cert = new X509Certificate(leaf), ca = new X509Certificate(issuer);
  assert.match(ca.subject, /První certifikační autorita/);
  assert.ok(verifyCertificateRevocation(emptyCrl, cert, ca) > Date.now());
  assert.throws(() => verifyCertificateRevocation(revokedCrl, cert, ca), /revoked/);
  assert.throws(() => verifyCertificateRevocation(emptyCrl, cert, ca, Date.now() + 3 * 86400000), /stale/);
  assert.throws(() => verifyCertificateRevocation(emptyCrl, cert, new X509Certificate(root)), /signature/);
  const corrupt = Buffer.from(emptyCrl); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => verifyCertificateRevocation(corrupt, cert, ca), /signature/);
});
