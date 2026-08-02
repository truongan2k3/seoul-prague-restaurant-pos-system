"use client";

import { Providers } from "@/components/providers";
import { StationBoard } from "@/components/station-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

function BarApp() {
  return (
    <StationScreenProvider station="bar">
      <StationBoard station="bar" variant="bar" />
    </StationScreenProvider>
  );
}

export default function BarPage() {
  return (
    <Providers>
      <BarApp />
    </Providers>
  );
}
