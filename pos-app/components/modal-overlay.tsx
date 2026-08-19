"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { MODAL_FADE_MS, useModalPresence } from "@/hooks/use-modal-presence";

const ModalPresenceContext = createContext(false);

export function useModalVisible() {
  return useContext(ModalPresenceContext);
}

interface ModalOverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  zIndexClass?: string;
  lockScroll?: boolean;
  role?: string;
  ariaModal?: boolean;
  ariaLabelledBy?: string;
  showBackdrop?: boolean;
}

export function ModalOverlay({
  open,
  onClose,
  children,
  className = "flex items-end justify-center p-0 sm:items-center sm:p-4",
  backdropClassName = "bg-black/60",
  zIndexClass = "z-50",
  lockScroll = true,
  role = "dialog",
  ariaModal = true,
  ariaLabelledBy,
  showBackdrop = true,
}: ModalOverlayProps) {
  const { mounted, visible } = useModalPresence(open);

  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) onClose();
    };

    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (lockScroll) {
        document.body.style.overflow = "";
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mounted, lockScroll, onClose]);

  if (!mounted) return null;

  return (
    <ModalPresenceContext.Provider value={visible}>
      <div
        className={`fixed inset-0 ${zIndexClass} ${className} transition-opacity ease-out ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ transitionDuration: `${MODAL_FADE_MS}ms` }}
        role={role}
        aria-modal={ariaModal}
        aria-labelledby={ariaLabelledBy}
      >
        {showBackdrop && onClose !== undefined && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`absolute inset-0 ${backdropClassName}`}
          />
        )}
        {showBackdrop && onClose === undefined && (
          <div aria-hidden="true" className={`absolute inset-0 ${backdropClassName}`} />
        )}
        {children}
      </div>
    </ModalPresenceContext.Provider>
  );
}

interface ModalPanelProps {
  children: ReactNode;
  className?: string;
}

export function ModalPanel({ children, className = "" }: ModalPanelProps) {
  const visible = useModalVisible();

  return (
    <div
      className={`relative z-10 transition-all ease-out ${
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-2 scale-[0.98] opacity-0 sm:translate-y-0"
      } ${className}`}
      style={{ transitionDuration: `${MODAL_FADE_MS}ms` }}
    >
      {children}
    </div>
  );
}
