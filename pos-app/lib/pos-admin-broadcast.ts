import { supabase } from "@/src/lib/supabase";
import type { PageTarget } from "@/lib/page-routes";
import type { AdminPopupBroadcastPayload } from "@/src/lib/status-admin-actions";

export const ADMIN_BROADCAST_CHANNEL = "pos_admin_broadcast";

export function subscribeToAdminPopup(
  pageTarget: PageTarget,
  onEvent: (payload: AdminPopupBroadcastPayload) => void,
): () => void {
  const channel = supabase
    .channel(ADMIN_BROADCAST_CHANNEL)
    .on("broadcast", { event: "admin_popup" }, ({ payload }) => {
      const data = payload as AdminPopupBroadcastPayload;
      if (!data.targets.includes(pageTarget)) return;
      onEvent(data);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
