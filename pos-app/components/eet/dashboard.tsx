"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Download, RefreshCw, Search, Settings2 } from "lucide-react";
import { exportEetCsvAction, getEetDashboardAction, getEetDetailsAction, getEetSettingsAction, retryEetTransactionAction, runEetWorkerAction, type EetFilters } from "@/src/lib/eet/actions";
import type { EetTransaction } from "@/src/lib/eet/types";

const card = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900";
const input = "rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700";
const money = (value: string | number) => new Intl.NumberFormat("en-CZ", { style: "currency", currency: "CZK" }).format(Number(value));
type Data = Awaited<ReturnType<typeof getEetDashboardAction>>;
type Settings = Awaited<ReturnType<typeof getEetSettingsAction>>;
type Detail = Awaited<ReturnType<typeof getEetDetailsAction>>;

function Badge({ row }: { row: EetTransaction }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "accepted" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : ["blocked", "failed", "uncertain"].includes(row.status) ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"}`}>{row.status}</span>;
}

function FiscalDataDetails({ transaction }: { transaction: EetTransaction }) {
  const { data, acknowledgment } = transaction;
  const accepted = transaction.status === "accepted" && Boolean(acknowledgment);
  const fields: [string, string | undefined][] = [
    ["Taxpayer EIČ · eic_popl", data.eic_popl],
    ["Unit ID · id_jednotky", data.id_jednotky],
    ["POS/register · id_pokl", data.id_pokl],
    ["Transaction number · porad_cis", data.porad_cis],
    ["Sale time · dat_trzby", data.dat_trzby],
    ["Reported total · celk_trzba", money(data.celk_trzba)],
    ["Designated for later use · urceno_cerp_zuct", data.urceno_cerp_zuct === undefined ? undefined : money(data.urceno_cerp_zuct)],
    ["Amount drawn · cerp_zuct", data.cerp_zuct === undefined ? undefined : money(data.cerp_zuct)],
  ];
  return <div className="mt-4 space-y-4">
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <h3 className="text-sm font-semibold">Fiscal data used for reporting · {transaction.environment}</h3>
      <p className={`mt-2 text-sm ${accepted ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}>{accepted ? "Tax authority acceptance verified." : "No verified acceptance recorded. A queued record or submission attempt does not prove receipt by the tax authority."}</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">These are the saved fiscal Data fields used for the request. Each submission also includes a message UUID, sending time, first/repeat flag and public signing certificate. Customer names, phone numbers and itemized dishes are not fields of this EET payload.</p>
    </div>
    {acknowledgment && <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="text-sm font-semibold">Verified acknowledgment</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs text-gray-500">POK</dt><dd className="mt-1 break-all font-mono text-xs">{acknowledgment.pok}</dd></div><div><dt className="text-xs text-gray-500">Received by tax authority</dt><dd className="mt-1 text-sm">{acknowledgment.receivedAt}</dd></div><div className="min-w-0"><dt className="text-xs text-gray-500">Message UUID</dt><dd className="mt-1 break-all font-mono text-xs">{acknowledgment.messageId}</dd></div><div><dt className="text-xs text-gray-500">Environment</dt><dd className="mt-1 text-sm">{acknowledgment.test ? "Playground test" : "Production"}</dd></div></dl></div>}
  </div>;
}
export function EetDashboard({ initial, initialSettings, initialFilters, onShowSettings }: { initial: Data; initialSettings: Settings; initialFilters: EetFilters; onShowSettings?: () => void }) {
  const [data, setData] = useState(initial);
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    let active = true;
    const update = async () => {
      if (document.hidden) return;
      try {
        const [next, status] = await Promise.all([getEetDashboardAction(filters), getEetSettingsAction()]);
        if (active) { setData(next); setSettings(status); }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Dashboard refresh failed."); }
    };
    void update();
    const timer = window.setInterval(() => void update(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [filters, refresh]);
  const action = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await operation(); setRefresh(n => n + 1); }
    catch (error) { setMessage(error instanceof Error ? error.message : "EET operation failed."); }
    finally { setBusy(false); }
  };
  const stale = !settings.readiness.workerHealthy;
  return <div className="space-y-5">
    <header className="flex flex-wrap justify-between gap-4"><div><h1 className="text-2xl font-semibold">EET Dashboard</h1><p className="mt-2 text-sm text-gray-500">{settings.settings.mode} · {settings.settings.submission_control} · Payment status is independent of reporting status.</p></div>{onShowSettings ? <button type="button" onClick={onShowSettings} className={`${input} inline-flex items-center gap-2`}><Settings2 size={16}/>EET settings</button> : <Link href="/app/eet" className={`${input} inline-flex items-center gap-2`}><Settings2 size={16}/>EET settings</Link>}</header>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Accepted", data.stats.accepted], ["Pending / processing", data.stats.pending + data.stats.processing], ["Retrying / uncertain", data.stats.retrying + data.stats.uncertain], ["Failed / review", data.stats.failed + data.stats.blocked]].map(([label, count]) => <div key={label} className={card}><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p></div>)}</div>
    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div><p className="text-xs uppercase text-gray-500">Net reportable amount · filtered records</p><p className="mt-1 text-2xl font-semibold">{money(data.stats.amount)}</p><p className="mt-1 text-xs text-gray-500">Includes corrections and held records. Playground values are test data.</p></div>
      <div className="space-y-1 text-sm"><p className="flex items-center gap-2"><Activity size={16}/>Worker: {settings.readiness.worker ? stale ? "Heartbeat overdue" : "Healthy" : "Disabled"}</p><p>Queue: {settings.health.pending} pending · {settings.health.errors} errors · {settings.health.overdue} overdue</p><p>Certificate: {settings.certificates[settings.settings.mode === "production" ? "production" : "playground"].valid ? "Valid" : "Missing / invalid"}</p></div>
      <button disabled={busy} onClick={() => void action(async () => { const result = await runEetWorkerAction(); setMessage(`Worker: ${result.state}.`); })} className={input}>Run one worker job</button>
    </section>
    {(settings.health.overdue > 0 || settings.health.errors > 0 || (settings.readiness.worker && stale)) && <p role="alert" className="rounded-xl border border-amber-300 p-3 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-200">Action required: review failed/held transactions and worker connectivity. Deadlines continue while sending is paused; overdue transactions remain reportable.</p>}
    <form className={`${card} flex flex-wrap items-end gap-3`} onSubmit={e => { e.preventDefault(); setFilters({ ...draft, page: 0 }); }}>
      <label className="text-xs">From<input type="date" className={`${input} mt-1 block`} value={draft.from.slice(0, 10)} onChange={e => setDraft(f => ({ ...f, from: `${e.target.value}T00:00:00Z` }))}/></label>
      <label className="text-xs">Before<input type="date" className={`${input} mt-1 block`} value={draft.to.slice(0, 10)} onChange={e => setDraft(f => ({ ...f, to: `${e.target.value}T00:00:00Z` }))}/></label>
      <label className="text-xs">Status<select className={`${input} mt-1 block`} value={draft.status ?? "all"} onChange={e => setDraft(f => ({ ...f, status: e.target.value as EetFilters["status"] }))}>{["all", "accepted", "pending", "processing", "retrying", "uncertain", "failed", "blocked"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="text-xs">Payment<select className={`${input} mt-1 block`} value={draft.method ?? "all"} onChange={e => setDraft(f => ({ ...f, method: e.target.value as EetFilters["method"] }))}>{["all", "cash", "card"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="min-w-40 flex-1 text-xs">ID / sale / sequence<input maxLength={50} className={`${input} mt-1 block w-full`} value={draft.search ?? ""} onChange={e => setDraft(f => ({ ...f, search: e.target.value }))}/></label>
      <button type="submit" className={`${input} inline-flex items-center gap-2`}><Search size={16}/>Filter</button>
      <button type="button" aria-label="Refresh dashboard" className={input} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16}/></button>
      <button type="button" disabled={busy} className={`${input} inline-flex items-center gap-2`} onClick={() => void action(async () => {
        const csv = await exportEetCsvAction(filters); const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "seoul-prague-eet.csv"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      })}><Download size={16}/>CSV</button>
    </form>
    <section className={`${card} overflow-x-auto`}>
      <table className="w-full text-left text-sm"><thead><tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800">{["Transaction", "Payment", "Amount", "Reporting", "POK", "Details"].map(h => <th className="pb-3 pr-4" key={h}>{h}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
        <td className="py-3 pr-4"><p className="font-semibold">{row.data.porad_cis}</p><p className="mt-1 text-xs text-gray-500">{row.created_at} · {row.environment}</p></td><td className="pr-4">{row.payment_method}<p className="text-xs text-gray-500">{row.kind}</p></td><td className="whitespace-nowrap pr-4 tabular-nums">{money(row.amount)}</td><td className="pr-4"><Badge row={row}/></td><td className="max-w-40 break-all pr-4 font-mono text-xs">{row.acknowledgment?.pok ?? "—"}</td><td><button disabled={busy} className="font-semibold text-emerald-700 underline dark:text-emerald-400" onClick={() => void action(async () => { setDetail(await getEetDetailsAction(row.id)); setReason(""); })}>View</button></td>
      </tr>)}</tbody></table>
      {!data.rows.length && <p className="py-8 text-center text-sm text-gray-500">No transactions in this range.</p>}
      <div className="mt-4 flex items-center justify-between text-sm"><span>{data.count} records · Page {data.page + 1}</span><div className="flex gap-2"><button disabled={data.page === 0} className={input} onClick={() => setFilters(f => ({ ...f, page: data.page - 1 }))}>Previous</button><button disabled={(data.page + 1) * 50 >= data.count} className={input} onClick={() => setFilters(f => ({ ...f, page: data.page + 1 }))}>Next</button></div></div>
    </section>
    {detail && <section className={card} aria-label="Transaction details"><div className="flex justify-between gap-3"><h2 className="font-semibold">{detail.transaction.data.porad_cis} · Transaction details</h2><button onClick={() => setDetail(null)} className="text-sm underline">Close</button></div><p className="mt-2 break-all text-xs text-gray-500">Payment {detail.transaction.sale_id} · Parent correction link: {detail.transaction.parent_id ?? "—"}</p><p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{detail.transaction.last_error ?? detail.transaction.block_reason}</p>
      <FiscalDataDetails transaction={detail.transaction}/>
      <details className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800"><summary className="cursor-pointer text-sm font-semibold">Fiscal data, submission attempts and audit · JSON</summary><p className="mt-2 text-xs text-gray-500">Saved fiscal data and metadata, not a copy of the complete signed SOAP envelope. Request/response hashes and attempt UUIDs are available below for comparison.</p><pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-gray-50 p-3 text-xs dark:bg-gray-950">{JSON.stringify({ fiscalData: detail.transaction.data, acknowledgment: detail.transaction.acknowledgment, attempts: detail.attempts, audit: detail.audit }, null, 2)}</pre></details>
      {detail.transaction.status !== "accepted" && <div className="mt-4 flex flex-wrap gap-2"><input aria-label="Reconciliation audit reason" placeholder="Audit reason for retry / reconciliation" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={`${input} min-w-52 flex-1`}/><button disabled={busy || reason.trim().length < 5} className={input} onClick={() => void action(async () => { await retryEetTransactionAction(detail.transaction.id, reason); setDetail(await getEetDetailsAction(detail.transaction.id)); setMessage("Retry queued. Fiscal Data is unchanged; the next attempt gets a new message UUID."); })}>Queue retry / reconcile</button></div>}
    </section>}
  </div>;
}
