"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Save, PlugZap, Activity } from "lucide-react";
import { getEetSettingsAction, saveEetPreparationAction, saveEetSettingsAction, testEetConnectionAction, testSignedPlaygroundResponseAction, type EetSettingsInput } from "@/src/lib/eet/actions";
import { EetMaterialsPanel } from "./materials-panel";
import { EetSetupGuide, type EetSetupScript } from "./setup-guide";

type Snapshot = Awaited<ReturnType<typeof getEetSettingsAction>>;
const fieldClass = "mt-1 w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";

function inputFrom(snapshot: Snapshot): EetSettingsInput {
  if (snapshot.preparation) return { ...snapshot.preparation.value };
  const s = snapshot.settings;
  return { mode: s.mode, submission_control: s.submission_control, business_name: s.business_name, establishment_address: s.establishment_address,
    eic: s.eic, unit_id: s.unit_id, register_id: s.register_id, tip_policy: s.tip_policy };
}

export function EetSettingsPanel({ initial: snapshot, scripts, onSnapshotChange, onShowDashboard }: { initial: Snapshot; scripts: EetSetupScript[]; onSnapshotChange: (next: Snapshot) => void; onShowDashboard?: () => void }) {
  const [value, setValue] = useState(() => inputFrom(snapshot));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wasLive = snapshot.settings.mode === "production";
  const phrase = wasLive && (value.mode !== "production" || value.submission_control === "paused") ? "STOP LIVE SUBMISSIONS"
    : value.mode === "production" && !wasLive ? "ACTIVATE PRODUCTION" : null;
  const frozen = snapshot.settings.capture_environment !== null;
  const baseline = inputFrom(snapshot);
  const dirty = (Object.keys(value) as (keyof EetSettingsInput)[]).some(key => value[key] !== baseline[key]);
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
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={24}/>EET Integration</h1><p className="mt-2 text-sm text-gray-500">Prepare now. Apply when you are ready to start reporting.</p></div>
      {onShowDashboard ? <button type="button" disabled={busy} onClick={onShowDashboard} className="rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-gray-700">EET Dashboard →</button> : <Link href="/app/eet" className="rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">EET Dashboard →</Link>}
    </header>
    <section className={cardClass}><h2 className="font-semibold">Save your preparation now</h2><p className="mt-2 text-sm text-gray-500">Fill in the details you already have and save them, even if some fields are still empty. Upload your Production register certificate below. Saving preparation does not start reporting. When the service is ready, complete the remaining details and press Apply.</p><p className="mt-3 text-sm">Active reporting: <strong className="capitalize">{snapshot.settings.mode} · {snapshot.settings.submission_control}</strong></p>{snapshot.preparation && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Preparation saved · {snapshot.preparation.savedAt} · not applied</p>}<p className="mt-3 text-xs text-gray-500">Official timetable checked 11 Nov 2026: Playground opened 1 Jul 2026; DIS+ registration/certificates are available; regular operation is scheduled for 1 Jan 2027. <a href="https://eet.gov.cz/cs/o-eet/jaky-je-harmonogram-eet-2-0" target="_blank" rel="noreferrer" className="underline">Financial Administration timetable</a>. This is the published schedule, not a live service-availability check.</p></section>
    {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[["Pending", snapshot.health.pending], ["Errors / review", snapshot.health.errors], ["Overdue", snapshot.health.overdue]].map(([label, count]) =>
      <div key={label} className={cardClass}><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => {
      const result = await saveEetPreparationAction(value, snapshot.settings.version);
      if (result.ok) onSnapshotChange({ ...snapshot, preparation: result.preparation });
      return result.message;
    }); }} className="space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
      <details className={cardClass}>
        <summary className="cursor-pointer font-semibold">Technical service readiness · advanced</summary>
        <p className="mt-2 text-sm text-gray-500">A successful connection test does not approve operational reporting. Complete an operational Playground acceptance test, configure the supervised worker, and obtain explicit approval before activating Production.</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Encrypted certificate storage</dt><dd>{snapshot.materials.storageReady && snapshot.readiness.encryption ? "Ready" : "Setup required"}</dd></div>
          <div><dt className="text-gray-500">Production register certificate</dt><dd>{snapshot.certificates.production.valid ? "Installed — verify DIS+ identity" : "Not ready"}</dd></div>
          <div><dt className="text-gray-500">Production response trust</dt><dd>{snapshot.materials.items.some(item => item.kind === "response" && item.environment === "production") ? "Imported — operational validation required" : "Import required (or server-managed pins)"}</dd></div>
          <div><dt className="text-gray-500">Secure payment capture</dt><dd>{snapshot.readiness.checkout ? "Enabled" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Background worker</dt><dd>{snapshot.readiness.worker ? snapshot.readiness.workerHealthy ? "Recent heartbeat" : "No recent heartbeat — check runner" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Protocol / live approval</dt><dd>{snapshot.readiness.protocol ? "Protocol reviewed" : "Protocol acceptance pending"} · {snapshot.readiness.productionApproved ? "Live approval configured" : "Production locked"}</dd></div>
        </dl>
      </details>
      <section className={cardClass}>
        <h2 className="font-semibold">Settings to use when you press Apply</h2>
        <p className="mt-2 text-sm text-gray-500">These selections are preparation only until applied.{dirty && <span className="ml-2 text-amber-700 dark:text-amber-300">Unsaved preparation changes</span>}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Integration mode<select className={fieldClass} value={value.mode} onChange={e => change("mode", e.target.value as EetSettingsInput["mode"])}>
            <option value="disabled">Disabled</option><option value="playground">Playground — test only</option>
            <option value="production">Production — live reporting</option>
          </select></label>
          <label className="text-sm">Submission control<select className={fieldClass} value={value.submission_control} onChange={e => change("submission_control", e.target.value as EetSettingsInput["submission_control"])}>
            <option value="paused">Paused — preserve queue</option><option value="automatic">Automatic</option>
          </select></label>
        </div>
        <p className="mt-3 text-sm text-gray-500">Choose Production for future live reporting. Playground is for test messages. Saving either selection leaves active reporting unchanged; Apply validates the service and credentials first.</p>
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
      <details className={cardClass}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Activity size={18}/>Service health · advanced</summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Last successful submission</dt><dd>{snapshot.settings.last_success_at ?? "No accepted submissions"}</dd></div>
          <div><dt className="text-gray-500">Last worker heartbeat</dt><dd>{snapshot.settings.worker_seen_at ?? "Not started"}</dd></div>
          <div><dt className="text-gray-500">Secure checkout / worker</dt><dd>{snapshot.readiness.checkout ? "Enabled" : "Off"} / {snapshot.readiness.worker ? "Enabled" : "Off"}</dd></div>
          <div><dt className="text-gray-500">Official protocol review</dt><dd>{snapshot.readiness.protocol ? "Configured — verify deployment acceptance record" : "Pending — submission blocked"}</dd></div>
        </dl>
        {snapshot.settings.worker_error && <p className="mt-3 text-sm text-amber-600">{snapshot.settings.worker_error}</p>}
      </details>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Save size={16}/>{busy ? "Working…" : "Save preparation"}</button>
        <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900" onClick={() => void perform(async () => {
          const prepared = await saveEetPreparationAction(value, snapshot.settings.version);
          if (!prepared.ok) return prepared.message;
          const preparedSnapshot = { ...snapshot, preparation: prepared.preparation };
          onSnapshotChange(preparedSnapshot);
          if (phrase && !window.confirm(phrase === "ACTIVATE PRODUCTION" ? "Apply Production settings and start live EET reporting for completed payments?" : "Apply this change and stop or pause live EET submissions? Pending reporting obligations and queued transactions will be preserved.")) return "Preparation saved. Apply was cancelled; active reporting is unchanged.";
          const result = await saveEetSettingsAction(value, snapshot.settings.version, phrase ?? "");
          if (result.ok && result.settings) {
            const next = { ...preparedSnapshot, settings: result.settings, preparation: null };
            onSnapshotChange(next); setValue(inputFrom(next));
          }
          if (!result.ok && ["EET_SETTINGS_CAPTURE_OFF", "EET_SETTINGS_WORKER_OFF", "EET_SETTINGS_PROTOCOL_PENDING", "EET_SETTINGS_PRODUCTION_LOCKED"].includes(result.errorCode)) return "Preparation saved. Apply is waiting for technical service setup/approval. You can keep preparing your business details and certificate; active reporting is unchanged. Service details are in the advanced section.";
          return result.ok ? result.message.replace("EET settings saved:", "Applied:") : `Preparation saved. Apply was not confirmed: ${result.message}`;
        })}><ShieldCheck size={16}/>Apply</button>
        <details className="basis-full"><summary className="cursor-pointer py-2 text-sm text-gray-500">Optional connection checks · advanced</summary><p className="my-3 text-xs text-gray-500">Save preparation first. The Playground checks use the prepared unit/register details and a separate Playground certificate without creating POS payments. A successful connection check is not Production approval.</p><div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => void perform(async () => (await testEetConnectionAction()).message)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"><PlugZap size={16}/>{snapshot.settings.mode === "production" ? "Test saved Production connection" : "Test Playground connection"}</button>
        <button type="button" disabled={busy} onClick={() => void perform(async () => {
          const result = await testSignedPlaygroundResponseAction();
          if (result.ok) {
            try { onSnapshotChange(await getEetSettingsAction()); }
            catch { return `${result.message} Use Recheck setup to refresh the audit display.`; }
          }
          return result.message;
        })} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"><ShieldCheck size={16}/>Test signed Playground response</button>
        </div></details>
      </div>
      </fieldset>
    </form>
    <EetMaterialsPanel overview={snapshot.materials} encryptionReady={snapshot.readiness.encryption} compact initialEnvironment="production" onSaved={async () => { onSnapshotChange(await getEetSettingsAction()); }}/>
    <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">Technical installation · advanced</summary><div className="mt-4"><EetSetupGuide scripts={scripts} encryptionConfigured={snapshot.readiness.encryption} hasStoredMaterials={snapshot.materials.items.length > 0}/></div></details>
    <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">Configuration and connection audit</summary><pre className="mt-3 max-h-72 overflow-auto text-xs">{JSON.stringify(snapshot.audit, null, 2)}</pre></details>
    <p className="text-xs text-gray-500">Protocol and legal source: <a href="https://eet.gov.cz/cs/pro-vyvojare" target="_blank" rel="noreferrer" className="underline">Czech Financial Administration — EET 2.0 developer documentation</a>.</p>
  </div>;
}
