"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Save, PlugZap, Activity } from "lucide-react";
import { getEetSettingsAction, saveEetSettingsAction, testEetConnectionAction, type EetSettingsInput } from "@/src/lib/eet/actions";

type Snapshot = Awaited<ReturnType<typeof getEetSettingsAction>>;
const fieldClass = "mt-1 w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";

function inputFrom(snapshot: Snapshot): EetSettingsInput {
  const s = snapshot.settings;
  return { mode: s.mode, submission_control: s.submission_control, business_name: s.business_name, establishment_address: s.establishment_address,
    eic: s.eic, unit_id: s.unit_id, register_id: s.register_id, tip_policy: s.tip_policy };
}

export function EetSettingsPanel({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [value, setValue] = useState(() => inputFrom(initial));
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const wasLive = snapshot.settings.mode === "production";
  const phrase = wasLive && (value.mode !== "production" || value.submission_control === "paused") ? "STOP LIVE SUBMISSIONS"
    : value.mode === "production" && !wasLive ? "ACTIVATE PRODUCTION" : null;
  const frozen = snapshot.settings.capture_environment !== null;
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
      <Link href="/admin/eet" className="rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">EET Dashboard →</Link>
    </header>
    {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[["Pending", snapshot.health.pending], ["Errors / review", snapshot.health.errors], ["Overdue", snapshot.health.overdue]].map(([label, count]) =>
      <div key={label} className={cardClass}><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => {
      await saveEetSettingsAction(value, snapshot.settings.version, confirmation);
      const next = await getEetSettingsAction(); setSnapshot(next); setValue(inputFrom(next)); setConfirmation("");
      return "EET settings saved. All queued transactions are preserved.";
    }); }} className="space-y-5">
      <section className={cardClass}>
        <h2 className="font-semibold">Reporting controls</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Integration mode<select className={fieldClass} value={value.mode} onChange={e => change("mode", e.target.value as EetSettingsInput["mode"])}>
            <option value="disabled">Disabled</option><option value="playground" disabled={Boolean(snapshot.settings.live_reporting_started_at)}>Playground — test only</option>
            <option value="production" disabled={!snapshot.readiness.productionApproved}>Production — live reporting</option>
          </select></label>
          <label className="text-sm">Submission control<select className={fieldClass} value={value.submission_control} onChange={e => change("submission_control", e.target.value as EetSettingsInput["submission_control"])}>
            <option value="paused">Paused — preserve queue</option><option value="automatic">Automatic</option>
          </select></label>
        </div>
        <p className="mt-3 text-sm text-gray-500">Playground acknowledgments do not satisfy legal reporting. Pause and Disabled stop sending; after capture starts, new payments continue to be queued. Neither setting removes reporting obligations. In-flight requests may finish.</p>
        {phrase && <label className="mt-4 block text-sm text-amber-700 dark:text-amber-300">Type <strong>{phrase}</strong> to confirm this change.<input autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={fieldClass}/></label>}
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold">Business and register</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Legal business name<input maxLength={200} value={value.business_name} onChange={e => change("business_name", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Establishment address<input maxLength={500} value={value.establishment_address} onChange={e => change("establishment_address", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">EIČ (not a legacy DIČ assumption)<input disabled={frozen} value={value.eic} onChange={e => change("eic", e.target.value.trim())} placeholder="CZ…" className={fieldClass}/></label>
          <label className="text-sm">Registrating unit ID from DIS+<input disabled={frozen} value={value.unit_id} onChange={e => change("unit_id", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Register / POS identifier<input disabled={frozen} maxLength={20} value={value.register_id} onChange={e => change("register_id", e.target.value)} className={fieldClass}/></label>
          <label className="text-sm">Tip ownership policy<select disabled={frozen} value={value.tip_policy} onChange={e => change("tip_policy", e.target.value as EetSettingsInput["tip_policy"])} className={fieldClass}>
            <option value="review_required">Review required</option><option value="business_income">Business income — report tips</option><option value="employee_income">Employee income — exclude tips</option>
          </select></label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Fiscal identity and tip policy are frozen when capture begins. Changing them requires an audited migration. Voucher payments remain held until their fiscal classification is reviewed.</p>
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold">Certificate management</h2><p className="mt-2 text-sm text-gray-500">Install and rotate separate Playground and Production credentials in server environment settings. Keys and certificates are never sent to this browser.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["playground", "production"] as const).map(env => {
          const cert = snapshot.certificates[env];
          return <div key={env} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="font-medium capitalize">{env}</h3><p className={`mt-2 text-sm ${cert.warning ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}`}>{!cert.configured ? "Not installed" : !cert.valid ? "Expired or invalid — action required" : `${cert.daysRemaining} days remaining`}</p><p className="mt-1 text-xs text-gray-500">Expires: {cert.expiresAt ?? "—"}</p>{cert.fingerprint && <p className="mt-2 break-all font-mono text-[10px] text-gray-500">SHA-256: {cert.fingerprint}</p>}</div>;
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
        <button type="button" disabled={busy} onClick={() => void perform(async () => { const result = await testEetConnectionAction(); return result.ok ? "Verification succeeded (official code 0). No sale was reported." : "Verification rejected; review the official error in the audit record."; })} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"><PlugZap size={16}/>Test saved connection</button>
      </div>
    </form>
    <details className={cardClass}><summary className="cursor-pointer text-sm font-semibold">Configuration and connection audit</summary><pre className="mt-3 max-h-72 overflow-auto text-xs">{JSON.stringify(snapshot.audit, null, 2)}</pre></details>
    <p className="text-xs text-gray-500">Protocol and legal source: <a href="https://eet.gov.cz/cs/pro-vyvojare" target="_blank" rel="noreferrer" className="underline">Czech Financial Administration — EET 2.0 developer documentation</a>.</p>
  </div>;
}
