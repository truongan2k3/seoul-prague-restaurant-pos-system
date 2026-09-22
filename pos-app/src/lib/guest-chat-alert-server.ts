import {
  GUEST_CHAT_ALERT_CHANNEL,
  GUEST_CHAT_ALERT_EVENT,
  type GuestChatAlertPayload,
} from "@/lib/guest-chat-alert";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

function realtimeBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function realtimeKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}

/** Notify POS terminals of a guest chat event without polling. */
export async function broadcastGuestChatAlert(payload: GuestChatAlertPayload): Promise<void> {
  if (await sendViaRealtimeHttp(payload)) return;
  await sendViaChannel(payload);
}

async function sendViaRealtimeHttp(payload: GuestChatAlertPayload): Promise<boolean> {
  const base = realtimeBaseUrl();
  const key = realtimeKey();
  if (!base || !key) return false;

  try {
    const response = await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: GUEST_CHAT_ALERT_CHANNEL,
            event: GUEST_CHAT_ALERT_EVENT,
            payload,
            private: false,
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        "[guest-chat-alert] HTTP broadcast failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[guest-chat-alert] HTTP broadcast error", error);
    return false;
  }
}

async function sendViaChannel(payload: GuestChatAlertPayload): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const channel = admin.channel(GUEST_CHAT_ALERT_CHANNEL, {
      config: { broadcast: { ack: true } },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscribe timeout")), 2000);
      void channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer);
          reject(new Error(status));
        }
      });
    });

    await channel.send({
      type: "broadcast",
      event: GUEST_CHAT_ALERT_EVENT,
      payload,
    });
    await admin.removeChannel(channel);
  } catch (error) {
    console.error("[guest-chat-alert] channel broadcast error", error);
  }
}
