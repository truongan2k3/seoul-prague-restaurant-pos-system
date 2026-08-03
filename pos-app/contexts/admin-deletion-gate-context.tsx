"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface AdminDeletionGateContextValue {
  requestDeletion: (onSuccess: () => void | Promise<void>) => void;
  modalOpen: boolean;
  passwordError: string | null;
  submitPassword: (password: string) => void;
  cancelDeletion: () => void;
}

const AdminDeletionGateContext = createContext<AdminDeletionGateContextValue | null>(null);

export function AdminDeletionGateProvider({
  children,
  verifyPassword,
}: {
  children: ReactNode;
  verifyPassword: (password: string) => boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [onSuccess, setOnSuccess] = useState<(() => void | Promise<void>) | null>(null);

  const requestDeletion = (callback: () => void | Promise<void>) => {
    setPasswordError(null);
    setOnSuccess(() => callback);
    setModalOpen(true);
  };

  const submitPassword = (password: string) => {
    if (verifyPassword(password)) {
      setModalOpen(false);
      setPasswordError(null);
      void onSuccess?.();
      setOnSuccess(null);
      return;
    }
    setPasswordError("Invalid Admin Password");
  };

  const cancelDeletion = () => {
    setModalOpen(false);
    setPasswordError(null);
    setOnSuccess(null);
  };

  return (
    <AdminDeletionGateContext.Provider
      value={{ requestDeletion, modalOpen, passwordError, submitPassword, cancelDeletion }}
    >
      {children}
    </AdminDeletionGateContext.Provider>
  );
}

export function useAdminDeletionGate() {
  const ctx = useContext(AdminDeletionGateContext);
  if (!ctx) throw new Error("useAdminDeletionGate must be used within AdminDeletionGateProvider");
  return ctx;
}
