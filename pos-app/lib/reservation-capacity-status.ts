/** Booking history may stay Late, but only these states retain dining capacity. */
export function reservationHoldsCapacity(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "checked_in";
}
