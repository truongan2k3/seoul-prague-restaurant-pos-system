"use client";

import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { minutesUntilReservation } from "@/lib/reservation-reminder";
import type { ReservationRecord } from "@/lib/types";

interface ReservationReminderModalProps {
  reservation: ReservationRecord | null;
  /** Which lead window triggered this popup (15 or 30). */
  leadMinutes?: number;
  onAcknowledge: () => void;
}

export function ReservationReminderModal({
  reservation,
  leadMinutes,
  onAcknowledge,
}: ReservationReminderModalProps) {
  const { translate, language } = useApp();
  const open = reservation != null;
  const minutesLeft = reservation
    ? minutesUntilReservation(reservation.reservedAt)
    : 0;
  const hintMinutes = leadMinutes ?? minutesLeft;

  const locale = language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB";
  const timeLabel = reservation
    ? reservation.reservedAt.toLocaleString(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Modal
      open={open}
      onClose={onAcknowledge}
      title={translate("resReminderTitle")}
      size="md"
      footer={
        <button
          type="button"
          onClick={onAcknowledge}
          className="min-h-[52px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700"
        >
          {translate("resReminderOk")}
        </button>
      }
    >
      {reservation && (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {translate("resReminderHint").replace("{minutes}", String(hintMinutes))}
          </p>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("guestName")}</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                {reservation.guestName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("partySize")}</dt>
              <dd className="text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {reservation.partySize}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("reservedAt")}</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                {timeLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500 dark:text-gray-400">{translate("table")}</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                {reservation.tableLabel?.trim() || translate("resReminderNoTable")}
              </dd>
            </div>
            {reservation.guestPhone?.trim() ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">{translate("guestPhone")}</dt>
                <dd className="text-right font-semibold text-gray-900 dark:text-gray-100">
                  {reservation.guestPhone}
                </dd>
              </div>
            ) : null}
            {reservation.notes?.trim() ? (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">{translate("resNotes")}</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                  {reservation.notes}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </Modal>
  );
}
