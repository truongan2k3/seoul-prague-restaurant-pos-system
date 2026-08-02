"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PinGateContextValue {
  requestPin: (onSuccess: () => void) => void;
  pinOpen: boolean;
  pinError: string | null;
  submitPin: (pin: string) => void;
  cancelPin: () => void;
}

const PinGateContext = createContext<PinGateContextValue | null>(null);

export function PinGateProvider({
  children,
  verifyPin,
}: {
  children: ReactNode;
  verifyPin: (pin: string) => boolean;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [onSuccess, setOnSuccess] = useState<(() => void) | null>(null);

  const requestPin = (callback: () => void) => {
    setPinError(null);
    setOnSuccess(() => callback);
    setPinOpen(true);
  };

  const submitPin = (pin: string) => {
    if (verifyPin(pin)) {
      setPinOpen(false);
      setPinError(null);
      onSuccess?.();
      setOnSuccess(null);
      return;
    }
    setPinError("Invalid PIN");
  };

  const cancelPin = () => {
    setPinOpen(false);
    setPinError(null);
    setOnSuccess(null);
  };

  return (
    <PinGateContext.Provider
      value={{ requestPin, pinOpen, pinError, submitPin, cancelPin }}
    >
      {children}
    </PinGateContext.Provider>
  );
}

export function usePinGate() {
  const ctx = useContext(PinGateContext);
  if (!ctx) throw new Error("usePinGate must be used within PinGateProvider");
  return ctx;
}
