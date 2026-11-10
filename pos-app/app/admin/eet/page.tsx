import { EetDashboard } from "@/components/eet/dashboard";
import { getEetDashboardAction, getEetSettingsAction } from "@/src/lib/eet/actions";

export const dynamic = "force-dynamic";
export default async function EetDashboardPage() {
  const now = new Date();
  const filters = { from: new Date(now.getTime() - 30 * 86_400_000).toISOString(), to: new Date(now.getTime() + 86_400_000).toISOString(), status: "all" as const, method: "all" as const };
  const result = await Promise.all([getEetDashboardAction(filters), getEetSettingsAction()]).catch(() => null);
  if (!result) return <div className="rounded-2xl border border-amber-300 p-5"><h1 className="text-xl font-semibold">EET Dashboard unavailable</h1><p className="mt-2 text-sm">An authorized EET administrator, server configuration and the additive EET migration are required. Existing POS payments remain on their current workflow while EET is disabled.</p></div>;
  return <EetDashboard initial={result[0]} initialSettings={result[1]} initialFilters={filters}/>;
}
