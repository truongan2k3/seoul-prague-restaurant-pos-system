"use client";

import { X } from "lucide-react";
import { type ReactNode } from "react";
import { ModalOverlay, ModalPanel } from "@/components/modal-overlay";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "md" | "lg" | "xl";
  bodyClassName?: string;
  scrollBody?: boolean;
  zIndexClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "default",
  bodyClassName = "",
  scrollBody = true,
  zIndexClass,
}: ModalProps) {
  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      ariaLabelledBy="modal-title"
      zIndexClass={zIndexClass}
    >
      <ModalPanel
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl sm:max-h-[92vh] sm:rounded-xl ${
          size === "xl"
            ? "sm:max-w-4xl"
            : size === "lg"
              ? "sm:max-w-2xl"
              : size === "md"
                ? "sm:max-w-md"
                : "sm:max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 id="modal-title" className="pos-serif text-lg font-medium tracking-tight text-[var(--foreground)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`flex-1 px-6 py-4 text-[var(--foreground)] ${
            scrollBody ? "overflow-y-auto" : "flex min-h-0 flex-col overflow-hidden"
          } ${bodyClassName}`}
        >
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--border)] px-6 py-4">
            {footer}
          </div>
        )}
      </ModalPanel>
    </ModalOverlay>
  );
}
