"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Save, PlugZap, Activity } from "lucide-react";
import { getEetSettingsAction, saveEetSettingsAction, testEetConnectionAction, testSignedPlaygroundResponseAction, type EetSettingsInput } from "@/src/lib/eet/actions";
import { EetMaterialsPanel } from "./materials-panel";
import { EetSetupGuide, type EetSetupScript } from "./setup-guide";

type Snapshot = Awaited<ReturnType<typeof getEetSettingsAction>>;
const fieldClass = "mt-1 w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";

function inputFrom(snapshot: Snapshot): EetSettingsInput {
  const s = snapshot.settings;
  return { mode: s.mode, submission_control: s.submission_control, business_name: s.business_name, establishment_address: s.establishment_address,
    eic: s.eic, unit_id: s.unit_id, register_id: s.register_id, tip_policy: s.tip_policy };
}

export function EetSettingsPanel({ initial: snapshot, scripts, onSnapshotChange, onShowDashboard }: { initial: Snapshot; scripts: EetSetupScript[]; onSnapshotChange: (next: Snapshot) => void; onShowDashboard?: () => void }) {
  const [value, setValue] = useState(() => inputFrom(snapshot));
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wasLive = snapshot.settings.mode === "production";
  const phrase = wasLive && (value.mode !== "production" || value.submission_control === "paused") ? "STOP LIVE SUBMISSIONS"
    : value.mode === "production" && !wasLive ? "ACTIVATE PRODUCTION" : null;
  const frozen = snapshot.settings.capture_environment !== null;
  const dirty = (Object.keys(value) as (keyof EetSettingsInput)[]).some(key => value[key] !== snapshot.settings[key]);
  const blockers = value.mode === "disabled" ? [] : [
    ...(!snapshot.readiness.checkout ? ["Secure payment capture is off (EET_CHECKOUT_ENABLED)."] : []),
    ...(value.submission_control === "automatic" && !snapshot.readiness.worker ? ["Automatic submission requires a configured durable worker (EET_WORKER_ENABLED)."] : []),
    ...(value.submission_control === "automatic" && !snapshot.readiness.protocol ? ["Operational protocol acceptance/review is pending (EET_PROTOCOL_REVIEWED)."] : []),
  ];
  const change = <K extends keyof EetSettingsInput>(key: K, next: EetSettingsInput[K]) => setValue(v => ({ ...v, [key]: next }));
  const perform = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { setMessage(await action()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "EET operation failed."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={24}/>EET Integration</h1><p className="mt-2 text-sm text-gray-500">Server-managed reporting · fiscal interface v4 · Production locked until approved.</p></div>
      {onShowDashboard ? <button type="button" disabled={busy} onClick={onShowDashboard} className="rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-gray-700">EET Dashboard →</button> : <Link href="/app/eet" className="rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">EET Dashboard →</Link>}
    </header>
    {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[["Pending", snapshot.health.pending], ["Errors / review", snapshot.health.errors], ["Overdue", snapshot.health.overdue]].map(([label, count]) =>
      <div key={label} className={cardClass}><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => {
      const result = await saveEetSettingsAction(value, snapshot.settings.version, confirmation);
      if (result.ok && result.settings) {
        const next = { ...snapshot, settings: result.settings };
        onSnapshotChange(next); setValue(inputFrom(next)); setConfirmation("");
      }
      return result.message;
    }); }} className="space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
      <section className={cardClass}>
        <h2 className="font-semibold">Go-live readiness</h2>
        <p className="mt-2 text-sm text-gray-500">A successful connection test does not approve operational reporting. Complete an operational Playground acceptance test, configure the supervised worker, and obtain explicit approval before activating Production.</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Encrypted certificate storage</dt><dd>{snapshot.materials.storageReady && snapshot.readiness.encryption ? "Ready" : "Setup required"}</dd></div>
          <div><dt className="text-gray-500">Production register certificate</dt><dd>{snapshot.certificates.production.valid ? "Installed — verify DIS+ identity" : "Not ready"}</dd></div>
          <div><dt className="text-gray-500">Production response trust</dt><dd>{snapshot.materials.items.some(item => item.kind === "response" && item.environment === "production") ? "Imported — operational validation required" : "Import required (or server-managed pins)"}</dd></div>
          <div><dt className="text-gray-500">Secure payment capture</dt><dd>{snapshot.readiness.checkout ? "Enabled" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Background worker</dt><dd>{snapshot.readiness.worker ? snapshot.readiness.workerHealthy ? "Recent heartbeat" : "No recent heartbeat — check runner" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Protocol / live approval</dt><dd>{snapshot.readiness.protocol ? "Protocol reviewed" : "Protocol acceptance pending"} · {snapshot.readiness.productionApproved ? "Live approval configured" : "Production locked"}</dd></div>
        </dl>
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold">Reporting controls</h2>
        <p className="mt-2 text-sm"><span className="text-gray-500">Saved configuration:</span> <strong className="capitalize">{snapshot.settings.mode} · {snapshot.settings.submission_control}</strong>{dirty && <span className="ml-2 text-amber-700 dark:text-amber-300">Unsaved changes</span>}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Integration mode<select className={fieldClass} value={value.mode} onChange={e => change("mode", e.target.value as EetSettingsInput["mode"])}>
            <option value="disabled">Disabled</option><option value="playground" disabled={Boolean(snapshot.settings.live_reporting_started_at)}>Playground — test only</option>
            <option value="production" disabled={!snapshot.readiness.productionApproved}>Production — live reporting</option>
          </select></label>
          <label className="text-sm">Submission control<select className={fieldClass} value={value.submission_control} onChange={e => change("submission_control", e.target.value as EetSettingsInput["submission_control"])}>
            <option value="paused">Paused — preserve queue</option><option value="automatic">Automatic</option>
          </select></label>
        </div>
        {blockers.length > 0 && <div className="mt-4 rounded-xl border border-amber-300 p-3 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-200"><p className="font-semibold">This selection cannot be saved yet:</p><ul className="mt-2 list-disc space-y-1 pl-5">{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul><p className="mt-2">You can use the connection test buttons with Disabled + Paused while completing setup. Use Save EET settings below for this form.</p></div>}
        <p className="mt-3 text-sm text-gray-500">Playground acknowledgments do not satisfy legal reporting. Pause and Disabled stop sending; after capture starts, new payments continue to be queued. Neither setting removes reporting obligations. In-flight requests may finish.</p>
        {phrase && <label className="mt-4 block text-sm text-amber-700 dark:text-amber-300">Type <strong>{phrase}</strong> to confirm this change.<input autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={fieldClass}/></label>}
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold">Business and register</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Legal business name<input maxLength={200} value={value.business_name} onChange={e => change("business_name", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Establishment address<input maxLength={500} value={value.establishment_address} onChange={e => change("establishment_address", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Taxpayer EIČ from DIS+ / certificate<input disabled={frozen} value={value.eic} onChange={e => change("eic", e.target.value.trim())} placeholder="CZ…" className={fieldClass}/></label>
          <label className="text-sm">Registrating unit ID from DIS+<input disabled={frozen} value={value.unit_id} onChange={e => change("unit_id", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Register / POS identifier<input disabled={frozen} maxLength={20} value={value.register_id} onChange={e => change("register_id", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Tip ownership policy<select disabled={frozen} value={value.tip_policy} onChange={e => change("tip_policy", e.target.value as EetSettingsInput["tip_policy"])} className={fieldClass}>
            <option value="review_required">Review required</option><option value="business_income">Business income — report tips</option><option value="employee_income">Employee income — exclude tips</option>
          </select></label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Fiscal identity and tip policy are frozen when capture begins. Changing them requires an audited migration. Voucher payments remain held until their fiscal classification is reviewed.</p>
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold">Certificate status</h2><p className="mt-2 text-sm text-gray-500">Import certificates using the forms below. Saved private keys are encrypted and never returned to the browser. Existing environment-managed credentials remain supported.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["playground", "production"] as const).map(env => {
          const cert = snapshot.certificates[env];
          return <div key={env} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="font-medium capitalize">{env}</h3><p className={`mt-2 text-sm ${cert.warning ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}`}>{!cert.configured ? "Not installed" : !cert.valid ? "Expired, invalid or unreadable — action required" : `${cert.daysRemaining} days remaining`}</p><p className="mt-1 text-xs text-gray-500">Expires: {cert.expiresAt ?? "—"}{cert.configured ? ` · ${cert.source === "pos" ? "Imported in POS" : "Server environment"}` : ""}</p>{cert.fingerprint && <p className="mt-2 break-all font-mono text-[10px] text-gray-500">SHA-256: {cert.fingerprint}</p>}</div>;
        })}</div>
      </section>
      <section className={cardClass}>
        <h2 className="flex items-center gap-2 font-semibold"><Activity size={18}/>Service health</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Last successful submission</dt><dd>{snapshot.settings.last_success_at ?? "No accepted submissions"}</dd></div>
          <div><dt className="text-gray-500">Last worker heartbeat</dt><dd>{snapshot.settings.worker_seen_at ?? "Not started"}</dd></div>
          <div><dt className="text-gray-500">Secure checkout / worker</dt><dd>{snapshot.readiness.checkout ? "Enabled" : "Off"} / {snapshot.readiness.worker ? "Enabled" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Official protocol review</dt><dd>{snapshot.readiness.protocol ? "Configured — verify deployment acceptance record" : "Pending — submission blocked"}</dd></div>
        </dl>
        {snapshot.settings.worker_error && <p className="mt-3 text-sm text-amber-600">{snapshot.settings.worker_error}</p>}
      </section>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || Boolean(phrase && confirmation !== phrase)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Save size={16}/>{busy ? "Working…" : "Save EET settings"}</button>
        <button type="button" disabled={busy} onClick={() => void perform(async () => (await testEetConnectionAction()).message)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"><PlugZap size={16}/>{snapshot.settings.mode === "production" ? "Test saved Production connection" : "Test Playground connection"}</button>
        <button type="button" disabled={busy} onClick={() => void perform(async () => {
          const result = await testSignedPlaygroundResponseAction();
          if (result.ok) {
            try { onSnapshotChange(await getEetSettingsAction()); }
            catch { return `${result.message} Use Recheck setup to refresh the audit display.`; }
          }
          return result.message;
        })} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"><ShieldCheck size={16}/>Test signed Playground response</button>
      </div>
      </fieldset>
    </form>
    <p className="text-xs text-gray-500">Save the unit/register identifiers before testing. Keep Disabled + Paused for the first Playground check. This check needs the official WSDL/XSD and a Playground register certificate; step 3 response signing certificates are not required. It uses the imported test certificate’s EIČ and a zero-value verification message, without queuing or reporting restaurant payments. Success is official code 0, not a signed sale acknowledgment or Production approval.</p>
    <p className="text-xs text-gray-500">After step 3, use Test signed Playground response to verify a signed test acknowledgment, including I.CA chain/revocation checks when CA trust is configured. This sends a zero-value operational test only to Playground using a reserved test certificate; it does not capture a POS payment, freeze the business identity or approve Production.</p>
    <EetMaterialsPanel overview={snapshot.materials} encryptionReady={snapshot.readiness.encryption} onSaved={async () => { onSnapshotChange(await getEetSettingsAction()); }}/>
    <EetSetupGuide scripts={scripts} encryptionConfigured={snapshot.readiness.encryption} hasStoredMaterials={snapshot.materials.items.length > 0}/>
    <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">Configuration and connection audit</summary><pre className="mt-3 max-h-72 overflow-auto text-xs">{JSON.stringify(snapshot.audit, null, 2)}</pre></details>
    <p className="text-xs text-gray-500">Protocol and legal source: <a href="https://eet.gov.cz/cs/pro-vyvojare" target="_blank" rel="noreferrer" className="underline">Czech Financial Administration — EET 2.0 developer documentation</a>.</p>
  </div>;
}
