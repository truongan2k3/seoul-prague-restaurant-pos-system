import { EetSettingsPanel } from "@/components/eet/settings-panel";
import { getEetSettingsAction } from "@/src/lib/eet/actions";

export const dynamic = "force-dynamic";
export default async function EetSettingsPage() {
  const settings = await getEetSettingsAction().catch(() => null);
  if (!settings) return <div className="rounded-2xl border border-amber-300 p-5"><h1 className="text-xl font-semibold">EET setup required</h1><p className="mt-2 text-sm">Configure AUTH_SECRET, the server Supabase key, EET_BUSINESS_ID and EET_ADMIN_STAFF_IDS, then apply the EET migration on staging. Access is limited to authorized EET administrators.</p></div>;
  return <EetSettingsPanel initial={settings}/>;
}
