/** Customer-safe cancellation reasons (staff picks; guest never sees internal notes). */

export const RESERVATION_CANCEL_REASONS = [
  { id: "changed_mind", label: "Change of plans", guestMessage: "Your reservation was cancelled because your plans changed." },
  { id: "booking_mistake", label: "Booked by mistake", guestMessage: "Your reservation was cancelled because it was booked by mistake." },
  {
    id: "capacity",
    label: "Restaurant capacity / fully booked",
    guestMessage:
      "We are unable to accommodate your party due to capacity limitations at the requested time.",
  },
  {
    id: "closed",
    label: "Restaurant closed",
    guestMessage:
      "We are unable to host your reservation because the restaurant is closed at the requested time.",
  },
  {
    id: "time",
    label: "Unable to accommodate requested time",
    guestMessage: "We are unable to accommodate the requested time.",
  },
  {
    id: "info",
    label: "Reservation information issue",
    guestMessage:
      "We were unable to complete your reservation due to an issue with the booking details.",
  },
  {
    id: "customer",
    label: "Customer requested cancellation",
    guestMessage: "Your reservation was cancelled as requested.",
  },
  {
    id: "duplicate",
    label: "Duplicate reservation",
    guestMessage: "This reservation was cancelled because a duplicate booking was found.",
  },
  {
    id: "other",
    label: "Other",
    guestMessage:
      "We are unable to honour this reservation and have had to cancel it. We apologise for the inconvenience.",
  },
] as const;

export type ReservationCancelReasonId = (typeof RESERVATION_CANCEL_REASONS)[number]["id"];

export const GUEST_RESERVATION_CANCEL_REASONS = RESERVATION_CANCEL_REASONS.filter(reason =>
  ["changed_mind", "booking_mistake", "duplicate", "other"].includes(reason.id));

export function validateGuestCancellation(reason: unknown, note: unknown): { reason: ReservationCancelReasonId; note: string } | { error: string } {
  const selected = GUEST_RESERVATION_CANCEL_REASONS.find(item => item.id === reason);
  if (!selected) return { error: "Choose a cancellation reason." };
  if (note !== undefined && note !== null && typeof note !== "string") return { error: "Enter valid cancellation details." };
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > 300) return { error: "Cancellation details must be 300 characters or fewer." };
  if (selected.id === "other" && !text) return { error: "Please explain the reason for cancellation." };
  return { reason: selected.id, note: text };
}

export function guestMessageForCancelReason(
  reasonId: string | null | undefined,
): string {
  const row = RESERVATION_CANCEL_REASONS.find((item) => item.id === reasonId);
  return row?.guestMessage ?? RESERVATION_CANCEL_REASONS.find((item) => item.id === "other")!.guestMessage;
}

export function cancelReasonLabel(reasonId: string | null | undefined): string {
  return RESERVATION_CANCEL_REASONS.find((item) => item.id === reasonId)?.label ?? reasonId ?? "—";
}
