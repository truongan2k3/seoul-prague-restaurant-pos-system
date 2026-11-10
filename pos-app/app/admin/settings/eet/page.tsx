import { EetSettingsPanel } from "@/components/eet/settings-panel";
import { getEetSettingsAction } from "@/src/lib/eet/actions";
import { getEetSetupScripts } from "@/src/lib/eet/setup-guide";
import { EetSetupGuide } from "@/components/eet/setup-guide";
import { EetMaterialsPanel } from "@/components/eet/materials-panel";
import { materialEncryptionReady } from "@/src/lib/eet/material-crypto";
import { describeEetSetupFailure } from "@/src/lib/eet/setup-diagnostics";

export const dynamic = "force-dynamic";
export default async function EetSettingsPage() {
  const [result, scripts] = await Promise.all([
    getEetSettingsAction().then(settings => ({ settings, issue: null }), error => ({ settings: null, issue: describeEetSetupFailure(error) })),
    getEetSetupScripts(),
  ]);
  if (!result.settings) {
    const issue = result.issue!;
    const encryptionReady = materialEncryptionReady();
    return <div className="space-y-5">
      <header><h1 className="text-2xl font-semibold">EET Integration · setup</h1><p className="mt-2 text-sm text-gray-500">The EET settings check stopped at the issue below. Uploads stay locked until this check passes; the encryption key has its own status.</p></header>
      <section role="alert" className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="break-all font-mono text-xs">{issue.code}</p>
        <h2 className="font-semibold">{issue.title}</h2>
        <p className="text-sm">{issue.action}</p>
        <p className="text-sm">Encryption key: <strong>{encryptionReady ? "Configured — keep the existing value" : "Missing or invalid on this deployment"}</strong></p>
        <a href="/admin/settings/eet" className="inline-flex rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold dark:border-amber-700">Recheck setup</a>
      </section>
      <EetSetupGuide scripts={scripts} initialOpen encryptionConfigured={encryptionReady}/>
      <EetMaterialsPanel overview={{ storageReady: false, items: [] }} encryptionReady={encryptionReady} setupBlockedReason={`Setup check stopped: ${issue.code}. Resolve the issue shown above, then recheck setup.`}/>
    </div>;
  }
  return <EetSettingsPanel initial={result.settings} scripts={scripts}/>;
}
