"use client";

import { StationBoard } from "@/components/station-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

export default function BarPage() {
  return (
    <StationScreenProvider station="bar">
      <StationBoard station="bar" variant="bar" />
    </StationScreenProvider>
  );
}
