"use client";

import { Providers } from "@/components/providers";
import { StationBoard } from "@/components/station-board";
import { StationScreenProvider } from "@/contexts/station-screen-context";

function KdsApp() {
  return (
    <StationScreenProvider station="kitchen">
      <StationBoard station="kitchen" variant="kitchen" />
    </StationScreenProvider>
  );
}

export default function KdsPage() {
  return (
    <Providers>
      <KdsApp />
    </Providers>
  );
}
