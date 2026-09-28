"use client";

import { ServerScreenBoard } from "@/components/server-screen-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

export default function KdsPage() {
  return (
    <StationScreenProvider station="kitchen">
      <ServerScreenBoard station="kitchen" />
    </StationScreenProvider>
  );
}
