"use client";

import { useRef, useState, type FormEvent } from "react";
import { FileCode2, KeyRound, LockKeyhole, Upload } from "lucide-react";
import { importEetProtocolAction, importEetResponseCertificatesAction, importEetSignerAction } from "@/src/lib/eet/material-actions";
import type { MaterialSummary } from "@/src/lib/eet/material-store";

const official = "https://eet.gov.cz/cs/pro-vyvojare/dokumenty-ke-stazeni";
const card = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";
const input = "mt-1 block w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 disabled:opacity-50";
const button = "inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const textarea = `${input} min-h-28 font-mono text-xs`;

function Saved({ item }: { item?: MaterialSummary }) {
  if (!item) return <p className="mt-2 text-xs text-gray-500">Not imported in POS yet.</p>;
  return <div className="mt-3 space-y-1 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
    <p>Saved · version {item.version} · {item.updated_at}</p>
    {item.metadata.eic && <p>Certificate EIČ: <strong>{item.metadata.eic}</strong></p>}
    {item.metadata.expiresAt && <p>Expires: {item.metadata.expiresAt}</p>}
    {item.metadata.certificateCount && <p>{item.metadata.certificateCount} response signing certificate(s)</p>}
    {item.metadata.fingerprint && <p className="break-all font-mono">Fingerprint: {item.metadata.fingerprint}</p>}
    {item.metadata.wsdlSha256 && <p className="break-all font-mono">WSDL SHA-256: {item.metadata.wsdlSha256}</p>}
    {item.metadata.xsdSha256 && <p className="break-all font-mono">XSD SHA-256: {item.metadata.xsdSha256}</p>}
  </div>;
}
export function EetMaterialsPanel({ overview, encryptionReady, onSaved, setupBlockedReason }: {
  overview: { storageReady: boolean; items: MaterialSummary[] };
  encryptionReady: boolean;
  onSaved?: () => Promise<void>;
  setupBlockedReason?: string;
}) {
  const [environment, setEnvironment] = useState<"playground" | "production">("playground");
  const [format, setFormat] = useState("pkcs12");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const ready = overview.storageReady && encryptionReady && !setupBlockedReason;
  const protocol = overview.items.find(item => item.kind === "protocol");
  const signer = overview.items.find(item => item.kind === "signer" && item.environment === environment);
  const response = overview.items.find(item => item.kind === "response" && item.environment === environment);
  const submit = async (event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<{ message: string }>) => {
    event.preventDefault();
    if (inFlight.current || !ready) return;
    const form = event.currentTarget;
    inFlight.current = true; setBusy(true); setMessage("");
    const data = new FormData(form);
    try {
      const result = await action(data);
      await onSaved?.();
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Material import failed."); }
    finally {
      // Credentials are write-only: no React secret state, browser storage, or read-back endpoint.
      form.reset();
      for (const key of [...data.keys()]) data.delete(key);
      inFlight.current = false; setBusy(false);
    }
  };
  return <section className="space-y-4" aria-labelledby="eet-materials-title">
    <header><h2 id="eet-materials-title" className="flex items-center gap-2 text-xl font-semibold"><Upload size={22}/>Tax-office files & certificates</h2>
      <p className="mt-2 text-sm text-gray-500">Upload a file or paste its contents here. Imports preserve the reporting mode and payment queue.</p></header>
    {!ready && <div role="status" className="space-y-2 rounded-xl border border-amber-300 p-3 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-200">
      {setupBlockedReason ? <p>{setupBlockedReason}</p> : <>
        {!overview.storageReady && <p>Encrypted certificate storage is not ready. Check the database project and the encrypted certificate storage migration.</p>}
        {!encryptionReady && <p>EET_SETTINGS_ENCRYPTION_KEY is missing or invalid on this deployment. Configure the existing key in Vercel, then redeploy.</p>}
      </>}
      <p>{encryptionReady ? "Encryption key: configured. Keep your existing value." : "Encryption key: not ready."} Import fields stay locked until authorization and encrypted storage checks pass.</p>
    </div>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 p-3 text-sm dark:border-emerald-900">{message}</p>}
    <form className={card} onSubmit={event => void submit(event, importEetProtocolAction)}>
      <h3 className="flex items-center gap-2 font-semibold"><FileCode2 size={18}/>1. Official protocol files</h3>
      <p className="mt-2 text-sm text-gray-500">Download <strong>EETServiceSOAP.wsdl</strong> and <strong>EETXMLSchema.xsd</strong> from the <a href={official} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">official EET developer downloads</a>. SHA-256 values are calculated automatically. XML imports are never executed as scripts.</p>
      <Saved item={protocol}/>
      <fieldset disabled={!ready || busy} className="mt-4 space-y-4">
        <input type="hidden" name="version" value={protocol?.version ?? 0}/>
        <div className="grid gap-4 lg:grid-cols-2">
          <div><label className="block text-sm">WSDL file<input name="wsdlFile" type="file" accept=".wsdl,.xml" className={input}/></label><label className="mt-3 block text-sm">Or paste WSDL XML<textarea name="wsdl" maxLength={65536} spellCheck={false} placeholder="Paste EETServiceSOAP.wsdl contents" className={textarea}/></label></div>
          <div><label className="block text-sm">XSD file<input name="xsdFile" type="file" accept=".xsd,.xml" className={input}/></label><label className="mt-3 block text-sm">Or paste XSD XML<textarea name="xsd" maxLength={65536} spellCheck={false} placeholder="Paste EETXMLSchema.xsd contents" className={textarea}/></label></div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input name="sourceReviewed" type="checkbox" required className="mt-1"/>I downloaded these files from the official EET website. Importing them does not replace technical/Playground acceptance.</label>
        <button type="submit" className={button}><Upload size={16}/>{busy ? "Working…" : protocol ? "Replace protocol files" : "Save protocol files"}</button>
      </fieldset>
    </form>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Certificate environment">
      {(["playground", "production"] as const).map(env => <button key={env} type="button" aria-pressed={environment === env} disabled={busy} onClick={() => setEnvironment(env)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${environment === env ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 dark:border-gray-700"}`}>{env === "playground" ? "Playground · test credentials" : "Production · live credentials"}</button>)}
    </div>
    <p className="text-sm text-gray-500">{environment === "playground" ? "Use the official Playground certificate bundle. Test EIČ belongs to the test certificate, not your restaurant." : "Use your restaurant register certificate obtained through DIS+ / MOJE daně. Saving it does not activate Production."}</p>
    <form key={`signer-${environment}`} className={card} onSubmit={event => void submit(event, importEetSignerAction)} autoComplete="off">
      <h3 className="flex items-center gap-2 font-semibold"><KeyRound size={18}/>2. {environment === "playground" ? "Playground" : "Production"} register certificate</h3>
      <p className="mt-2 text-sm text-gray-500">{environment === "playground" ? <a href={official} target="_blank" rel="noreferrer" className="underline">Get CAEET_Playground_2026_v1.zip from the official downloads, extract it, then upload the .p12 file inside.</a> : <a href="https://www.mojedane.cz/" target="_blank" rel="noreferrer" className="underline">Obtain your own register certificate through MOJE daně / DIS+.</a>} ZIP archives and scripts are not accepted here.</p>
      <Saved item={signer}/>
      <fieldset disabled={!ready || busy} className="mt-4 space-y-4">
        <input type="hidden" name="environment" value={environment}/><input type="hidden" name="version" value={signer?.version ?? 0}/>
        <label className="block text-sm">Certificate format<select name="format" value={format} onChange={e => setFormat(e.target.value)} className={input}><option value="pkcs12">PKCS#12 (.p12 / .pfx) — recommended</option><option value="pem">Separate certificate and private key (PEM)</option></select></label>
        {format === "pkcs12" ? <label className="block text-sm">Certificate bundle · maximum 128 KB<input name="bundle" type="file" accept=".p12,.pfx" required className={input}/></label> : <div className="grid gap-4 lg:grid-cols-2">
          <div><label className="block text-sm">Certificate file<input name="certificateFile" type="file" accept=".pem,.crt,.cer" className={input}/></label><label className="mt-3 block text-sm">Or paste certificate PEM<textarea name="certificate" maxLength={16384} spellCheck={false} className={textarea} placeholder="-----BEGIN CERTIFICATE-----"/></label></div>
          <div><label className="block text-sm">Private-key PEM file<input name="privateKeyFile" type="file" accept=".pem,.key" className={input}/></label><label className="mt-3 block text-sm">Or paste private-key PEM<textarea name="privateKey" maxLength={32768} spellCheck={false} autoComplete="off" className={textarea} placeholder="Paste the matching private key; never shown again after import"/></label></div>
        </div>}
        <label className="block text-sm">{format === "pkcs12" ? "Bundle password" : "Encrypted-key passphrase (if applicable)"}<input name="password" type="password" maxLength={1024} autoComplete="new-password" className={input}/></label>
        <p className="text-xs text-gray-500">Password is used only to unlock the import. Stored keys are encrypted on the server. Input fields clear after every attempt; saved secrets cannot be viewed or downloaded.</p>
        <button type="submit" className={button}><LockKeyhole size={16}/>{busy ? "Working…" : signer ? "Replace register certificate securely" : "Save register certificate securely"}</button>
      </fieldset>
    </form>
    <form key={`response-${environment}`} className={card} onSubmit={event => void submit(event, importEetResponseCertificatesAction)}>
      <h3 className="font-semibold">3. Tax-authority response signing certificates</h3>
      <p className="mt-2 text-sm text-gray-500">These verify the tax authority’s acknowledgment signature. Obtain the signing leaf certificates identified in the <a href={official} target="_blank" rel="noreferrer" className="underline">official access/operational documentation</a>. They differ from your register certificate and taxpayer/TLS CA roots.</p>
      <Saved item={response}/>
      <fieldset disabled={!ready || busy} className="mt-4 space-y-4">
        <input type="hidden" name="environment" value={environment}/><input type="hidden" name="version" value={response?.version ?? 0}/>
        <label className="block text-sm">Signing certificate file<input name="responseFile" type="file" accept=".pem,.crt,.cer" className={input}/></label>
        <label className="block text-sm">Or paste signing certificate PEM(s)<textarea name="responseCertificates" maxLength={65536} spellCheck={false} className={textarea} placeholder="One or more independently verified signing leaf certificates"/></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="trustReviewed" required className="mt-1"/>I verified the source and environment of these tax-authority response signing leaf certificates.</label>
        <button type="submit" className={button}><Upload size={16}/>{busy ? "Working…" : response ? "Replace response signing certificates" : "Save response signing certificates"}</button>
      </fieldset>
    </form>
  </section>;
}
