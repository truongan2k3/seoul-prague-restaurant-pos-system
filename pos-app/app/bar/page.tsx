"use client";

import { ServerScreenBoard } from "@/components/server-screen-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

export default function BarPage() {
  return (
    <StationScreenProvider station="bar">
      <ServerScreenBoard station="bar" />
    </StationScreenProvider>
  );
}
