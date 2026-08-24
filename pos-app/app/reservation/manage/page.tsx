import { Suspense } from "react";
import { ReservationManageView } from "@/components/reservation-manage-view";

export default function ReservationManagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
          Loading…
        </div>
      }
    >
      <ReservationManageView />
    </Suspense>
  );
}
