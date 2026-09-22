import type { TableGuestRequestKind, TableGuestRequestRecord } from "@/lib/table-guest";
import { supabase } from "@/src/lib/supabase";


export const GUEST_TABLE_REQUEST_ALERT_CHANNEL = "pos-guest-table-requests";
export const GUEST_TABLE_REQUEST_ALERT_EVENT = "table-guest-request";

export type GuestTableRequestAlertPayload = {
  requestId: string;
  tableId: string;
  tableLabel: string;
  kind: TableGuestRequestKind;
  summary: string;
  createdAt: string;
};

export function summarizeGuestRequest(request: TableGuestRequestRecord): string {
  if (request.kind === "call_staff") return "Guest is calling staff";
  if (request.kind === "grill_change") return "Grill mesh change requested";
  if (request.kind === "payment") {
    const method = request.payload.paymentMethod === "cash" ? "cash" : "card";
    return `Payment requested (${method})`;
  }
  const items = request.payload.banchan ?? [];
  if (items.length === 0) return "Banchan requested";
  return `Banchan: ${items.map((item) => `${item.quantity}× ${item.label}`).join(", ")}`;
}


export function subscribeToTableGuestRequests(
  onEvent: (payload: GuestTableRequestAlertPayload) => void,
): () => void {
  const channel = supabase
    .channel(GUEST_TABLE_REQUEST_ALERT_CHANNEL)
    .on("broadcast", { event: GUEST_TABLE_REQUEST_ALERT_EVENT }, ({ payload }) => {
      onEvent(payload as GuestTableRequestAlertPayload);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
