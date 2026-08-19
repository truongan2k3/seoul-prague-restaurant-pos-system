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
}: ModalProps) {
  return (
    <ModalOverlay open={open} onClose={onClose} ariaLabelledBy="modal-title">
      <ModalPanel
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:max-h-[92vh] sm:rounded-xl ${
          size === "xl"
            ? "sm:max-w-4xl"
            : size === "lg"
              ? "sm:max-w-2xl"
              : size === "md"
                ? "sm:max-w-md"
                : "sm:max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`flex-1 px-6 py-4 text-gray-800 dark:text-gray-200 ${
            scrollBody ? "overflow-y-auto" : "flex min-h-0 flex-col overflow-hidden"
          } ${bodyClassName}`}
        >
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            {footer}
          </div>
        )}
      </ModalPanel>
    </ModalOverlay>
  );
}
