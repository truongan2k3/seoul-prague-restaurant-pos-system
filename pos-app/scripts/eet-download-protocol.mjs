// Public official artifacts only. Review the bytes and release notes before setting approval flags.
// This script does not download private keys, install credentials, or enable reporting.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? "/tmp/seoul-eet-official");
await mkdir(output, { recursive: true });
for (const name of ["EETServiceSOAP.wsdl", "EETXMLSchema.xsd"]) {
  const url = `https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/${name}`;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Official artifact unavailable: ${name} (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 128 * 1024 || !bytes.toString("utf8").includes("http://fs.gov.cz/eet/schema/v4")) throw new Error("Unexpected official artifact; manual review required.");
  await writeFile(resolve(output, name), bytes, { mode: 0o600 });
  process.stdout.write(`${name} SHA256 ${createHash("sha256").update(bytes).digest("hex")}\n`);
}
