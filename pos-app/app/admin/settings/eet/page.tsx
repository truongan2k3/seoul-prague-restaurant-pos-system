import { EetSettingsPanel } from "@/components/eet/settings-panel";
import { getEetSettingsAction } from "@/src/lib/eet/actions";
import { getEetSetupScripts } from "@/src/lib/eet/setup-guide";
import { EetSetupGuide } from "@/components/eet/setup-guide";
import { EetMaterialsPanel } from "@/components/eet/materials-panel";

export const dynamic = "force-dynamic";
export default async function EetSettingsPage() {
  const [settings, scripts] = await Promise.all([getEetSettingsAction().catch(() => null), getEetSetupScripts()]);
  if (!settings) return <div className="space-y-5"><header><h1 className="text-2xl font-semibold">EET Integration · setup</h1><p className="mt-2 text-sm text-gray-500">The secure EET administrator/server setup is incomplete or unavailable. Follow the steps below using your existing projects, then reload Settings. Reporting stays disabled until explicitly configured.</p></header><EetSetupGuide scripts={scripts} initialOpen/><EetMaterialsPanel overview={{ storageReady: false, items: [] }} encryptionReady={false}/></div>;
  return <EetSettingsPanel initial={settings} scripts={scripts}/>;
}
