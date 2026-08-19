"use client";

import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";

interface ChangelogPopupModalProps {
  open: boolean;
  title: string;
  body: string;
  onAcknowledge: () => void;
}

export function ChangelogPopupModal({
  open,
  title,
  body,
  onAcknowledge,
}: ChangelogPopupModalProps) {
  const { translate } = useApp();
  const trimmedBody = body.trim();

  return (
    <Modal
      open={open}
      onClose={onAcknowledge}
      title={title.trim() || translate("changelogPopupDefaultTitle")}
      size="md"
      bodyClassName="!max-h-[min(70vh,28rem)]"
      footer={
        <button
          type="button"
          onClick={onAcknowledge}
          className="min-h-[48px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700"
        >
          {translate("changelogPopupUnderstand")}
        </button>
      }
    >
      {trimmedBody ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {body}
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{translate("changelogPopupEmptyBody")}</p>
      )}
    </Modal>
  );
}
