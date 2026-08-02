import type { Metadata } from "next";
import { ReservationBookingView } from "@/components/reservation-booking-view";

export const metadata: Metadata = {
  title: "Make a Reservation | SEOUL PRAGUE",
  description: "Reserve your table at SEOUL PRAGUE hotpot restaurant in Prague.",
};

export default function ReservationPage() {
  return <ReservationBookingView />;
}
