"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConnectionStatus } from "@/lib/connection-status";

interface ConnectionStatusContextValue {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | null>(null);

export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("offline");

  const value = useMemo(() => ({ status, setStatus }), [status]);

  return (
    <ConnectionStatusContext.Provider value={value}>{children}</ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus() {
  const context = useContext(ConnectionStatusContext);
  if (!context) {
    throw new Error("useConnectionStatus must be used within ConnectionStatusProvider");
  }
  return context;
}
