"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { getEetWorkspaceAction, lockEetWorkspaceAction, unlockEetWorkspaceAction } from "@/src/lib/eet/workspace-actions";
import { getEetDashboardAction, type EetFilters } from "@/src/lib/eet/actions";
import { EetSettingsPanel } from "./settings-panel";
import { EetDashboard } from "./dashboard";
import { EetSetupGuide } from "./setup-guide";

type Workspace = Awaited<ReturnType<typeof getEetWorkspaceAction>>;
type Ready = Extract<Workspace, { state: "ready" }>;

function Dashboard({ workspace, onSettings }: { workspace: Ready; onSettings: () => void }) {
  const [result, setResult] = useState<{ data: Awaited<ReturnType<typeof getEetDashboardAction>>; filters: EetFilters } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const now = Date.now();
    const filters: EetFilters = { from: new Date(now - 30 * 86400000).toISOString(), to: new Date(now + 86400000).toISOString(), status: "all", method: "all" };
    void getEetDashboardAction(filters).then(data => { if (active) setResult({ data, filters }); }, () => { if (active) setError("Dashboard unavailable. Recheck manager access and database connectivity."); });
    return () => { active = false; };
  }, []);
  if (!result) return <p role="status" className="py-6 text-sm">{error || "Loading EET dashboard…"}</p>;
  return <EetDashboard initial={result.data} initialSettings={workspace.settings} initialFilters={result.filters} onShowSettings={onSettings}/>;
}

export function EetPosWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try { const result = await getEetWorkspaceAction(); if (current === generation.current) setWorkspace(result); }
    catch { if (current === generation.current) { setWorkspace(null); setMessage("EET setup could not be loaded. Recheck the connection."); } }
  }, []);
  useEffect(() => {
    const requests = generation;
    const current = ++requests.current;
    void getEetWorkspaceAction().then(result => { if (current === requests.current) setWorkspace(result); }, () => { if (current === requests.current) setMessage("EET setup could not be loaded. Recheck the connection."); });
    return () => { requests.current++; };
  }, []);
  useEffect(() => {
    if (workspace?.state !== "ready") return;
    const timer = window.setTimeout(() => { generation.current++; setWorkspace({ state: "locked", scripts: workspace.scripts, encryptionReady: workspace.settings.readiness.encryption }); setDashboard(false); setMessage("Manager access expired. Enter the code again."); }, Math.max(0, workspace.expiresAt - Date.now()));
    const recheck = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", recheck);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", recheck); };
  }, [workspace, refresh]);
  const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700 disabled:opacity-40";
  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18}/>EET · Manager access</p><div className="flex gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/>Recheck setup</button>
      {workspace?.state === "ready" && <button type="button" className={button} onClick={() => {
        generation.current++; setWorkspace({ state: "locked", scripts: workspace.scripts, encryptionReady: workspace.settings.readiness.encryption }); setDashboard(false);
        void lockEetWorkspaceAction().catch(() => setMessage("Could not revoke server access. It expires automatically within 10 minutes."));
      }}><LockKeyhole size={16}/>Lock EET</button>}
    </div></div>
    {message && <p role="status" className="rounded-xl border border-amber-300 p-3 text-sm">{message}</p>}
    {!workspace && !message && <p role="status">Checking EET access…</p>}
    {workspace?.state === "locked" && <>
      <form autoComplete="off" className="mx-auto max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900" onSubmit={async event => {
        event.preventDefault(); if (busy) return;
        const form = event.currentTarget, data = new FormData(form);
        setBusy(true); setMessage("");
        try { const result = await unlockEetWorkspaceAction(String(data.get("managerCode") ?? "")); setMessage(result.message); if (result.ok) await refresh(); }
        catch { setMessage("EET could not be unlocked. Recheck your connection."); }
        finally { form.reset(); data.delete("managerCode"); setBusy(false); }
      }}>
        <LockKeyhole className="text-emerald-600" size={28}/><h2 className="text-xl font-semibold">Unlock EET settings</h2>
        <p className="text-sm text-gray-500">Enter the existing POS manager code. Access expires after 10 minutes and is checked again by the server for every EET operation.</p>
        <label className="block text-sm font-medium">Manager code<input name="managerCode" type="password" required maxLength={128} autoComplete="off" className="mt-2 block w-full rounded-xl border border-gray-300 bg-transparent p-3 dark:border-gray-700"/></label>
        <button type="submit" disabled={busy} className={`${button} w-full bg-emerald-700 text-white`}>{busy ? "Checking…" : "Unlock EET"}</button>
      </form>
      <EetSetupGuide scripts={workspace.scripts} encryptionConfigured={workspace.encryptionReady}/>
    </>}
    {workspace?.state === "error" && <>
      <section role="alert" className="space-y-3 rounded-2xl border border-amber-300 p-5"><p className="font-mono text-xs">{workspace.issue.code}</p><h2 className="font-semibold">{workspace.issue.title}</h2><p className="text-sm">{workspace.issue.action}</p><p className="text-sm">Encryption key: {workspace.encryptionReady ? "Configured — keep the existing value" : "Missing or invalid"}</p></section>
      {!!workspace.scripts.length && <EetSetupGuide scripts={workspace.scripts} encryptionConfigured={workspace.encryptionReady}/>}
    </>}
    {workspace?.state === "ready" && (dashboard ? <Dashboard workspace={workspace} onSettings={() => setDashboard(false)}/> : <EetSettingsPanel initial={workspace.settings} scripts={workspace.scripts} onShowDashboard={() => setDashboard(true)}/>)}
  </div>;
}
