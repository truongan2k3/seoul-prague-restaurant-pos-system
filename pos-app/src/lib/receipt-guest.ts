import type { ReceiptGuest } from "@/lib/receipt-calculations";
import { findActiveReservationForTable } from "@/src/lib/reservation-actions";
import { supabase } from "@/src/lib/supabase";

/** Read before settlement for live bills; use the linked reservation on reprints. */
export async function fetchReceiptGuest(input: { tableId?: string; reservationId?: string }): Promise<ReceiptGuest> {
  try {
    const result = input.reservationId
      ? await supabase.from("reservations").select("guest_name,guest_email,party_size,actual_party_size")
          .eq("id", input.reservationId).maybeSingle()
      : input.tableId ? await findActiveReservationForTable(input.tableId) : null;
    if (!result || result.error || !result.data) return {};
    const row = result.data;
    const partySize = Number(row.actual_party_size ?? row.party_size);
    return {
      guestName: row.guest_name?.trim() || undefined,
      guestEmail: row.guest_email?.trim() || undefined,
      partySize: partySize > 0 ? partySize : undefined,
    };
  } catch {
    // Missing optional guest information must not prevent printing a paid bill.
    return {};
  }
}
