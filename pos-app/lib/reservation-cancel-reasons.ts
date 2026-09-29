/** Customer-safe cancellation reasons (staff picks; guest never sees internal notes). */

export const RESERVATION_CANCEL_REASONS = [
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

export function guestMessageForCancelReason(
  reasonId: string | null | undefined,
): string {
  const row = RESERVATION_CANCEL_REASONS.find((item) => item.id === reasonId);
  return row?.guestMessage ?? RESERVATION_CANCEL_REASONS.find((item) => item.id === "other")!.guestMessage;
}

export function cancelReasonLabel(reasonId: string | null | undefined): string {
  return RESERVATION_CANCEL_REASONS.find((item) => item.id === reasonId)?.label ?? reasonId ?? "—";
}
