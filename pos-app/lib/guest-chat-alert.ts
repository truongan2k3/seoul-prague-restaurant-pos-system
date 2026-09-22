import type { GuestChatSession } from "@/lib/guest-chat";
import { supabase } from "@/src/lib/supabase";

export const GUEST_CHAT_ALERT_CHANNEL = "pos-guest-chat-alerts";
export const GUEST_CHAT_ALERT_EVENT = "guest-chat";

export type GuestChatAlertKind = "new_message" | "follow_up" | "session_updated";

export type GuestChatAlertPayload = {
  kind: GuestChatAlertKind;
  sessionId: string;
  preview?: string;
  guestClientId?: string;
  status?: GuestChatSession["status"];
  unreadByStaff?: boolean;
};

export function subscribeToGuestChatAlerts(
  onEvent: (payload: GuestChatAlertPayload) => void,
): () => void {
  const channel = supabase
    .channel(GUEST_CHAT_ALERT_CHANNEL)
    .on("broadcast", { event: GUEST_CHAT_ALERT_EVENT }, ({ payload }) => {
      const data = payload as GuestChatAlertPayload | undefined;
      if (!data?.sessionId || !data.kind) return;
      onEvent(data);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
