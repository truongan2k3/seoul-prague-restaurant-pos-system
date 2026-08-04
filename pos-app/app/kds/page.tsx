"use client";

import { StationBoard } from "@/components/station-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

export default function KdsPage() {
  return (
    <StationScreenProvider station="kitchen">
      <StationBoard station="kitchen" variant="kitchen" />
    </StationScreenProvider>
  );
}
