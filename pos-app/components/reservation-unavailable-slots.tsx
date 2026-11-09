"use client";

import { useEffect, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import type { SlotAvailability } from "@/lib/reservation-capacity-engine";
import { groupCapacityTimelineSegments } from "@/lib/reservation-capacity-segments";
import { parseTimeToMinutes } from "@/lib/reservation-slots";
import { venueWallTimeToUtc } from "@/lib/venue-timezone";
import type { LanguageCode } from "@/lib/types";

const COPY = {
  en: { title: "Unavailable booking times", full: "Full", loading: "Checking booking capacity…",
    clear: "No fully booked time slots.", closed: "No remaining booking times for this date.",
    error: "Could not load booking capacity.", retry: "Retry",
    disabled: "Capacity checks are disabled. These full time slots are informational; bookings are still accepted." },
  cs: { title: "Nedostupné časy rezervací", full: "Plně obsazeno", loading: "Kontroluji kapacitu rezervací…",
    clear: "Žádný čas není plně obsazen.", closed: "Pro tento den nezbývají žádné časy rezervací.",
    error: "Kapacitu se nepodařilo načíst.", retry: "Zkusit znovu",
    disabled: "Kontrola kapacity je vypnutá. Plné časy jsou pouze informativní; rezervace se stále přijímají." },
  vi: { title: "Khung giờ không thể đặt bàn", full: "Đã đủ chỗ", loading: "Đang kiểm tra sức chứa…",
    clear: "Không có khung giờ nào hết chỗ.", closed: "Không còn khung giờ đặt bàn cho ngày này.",
    error: "Không tải được thông tin sức chứa.", retry: "Thử lại",
    disabled: "Limit đang tắt. Các khung giờ hết chỗ chỉ để tham khảo; hệ thống vẫn nhận đặt bàn." },
  zh: { title: "不可预约时段", full: "已满", loading: "正在检查预约容量…",
    clear: "没有已满的预约时段。", closed: "该日期没有剩余预约时段。",
    error: "无法加载预约容量。", retry: "重试",
    disabled: "容量限制已关闭。已满时段仅供参考，系统仍接受预约。" },
} as const;

type Slot = { time: string; availability: SlotAvailability };

/** Read-only: the smallest online party and no grill restriction identify fully blocked slots. */
export function ReservationUnavailableSlots({ dateIso, refreshKey, language, now }: {
  dateIso: string; refreshKey: string; language: LanguageCode; now: number;
}) {
  const { settings } = useSettings();
  const copy = COPY[language];
  const [revision, setRevision] = useState(0);
  const [payload, setPayload] = useState<{ key: string; slots: Slot[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string } | null>(null);
  const settingsVersion = JSON.stringify([settings.reservationOperatingHours, settings.reservationTimeStep,
    settings.reservationDurationMinutes, settings.reservationBufferMinutes, settings.reservationMaxGuestsPerSlot,
    settings.reservationCapacityLimitsEnabled]);
  const requestKey = JSON.stringify([dateIso, refreshKey, settingsVersion, revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ date: dateIso, partySize: "2" });
          const response = await fetch(`/api/reservations/capacity/overview?${params}`, {
            cache: "no-store", signal: controller.signal,
          });
          const result = await response.json() as { date?: string; slots?: Slot[] };
          if (!response.ok || result.date !== dateIso || !Array.isArray(result.slots)) throw new Error("Capacity unavailable");
          if (!controller.signal.aborted) setPayload({ key: requestKey, slots: result.slots });
        } catch {
          if (!controller.signal.aborted) setFailure({ key: requestKey });
        }
      })();
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [dateIso, requestKey]);

  const loaded = payload?.key === requestKey ? payload : null;
  const error = failure?.key === requestKey;
  const futureSlots = loaded?.slots.filter(slot => venueWallTimeToUtc(dateIso, slot.time).getTime() > now) ?? [];
  // Keep closed-hours gaps separate, and never join full periods across a free slot.
  const runs: Slot[][] = [];
  for (const slot of futureSlots) {
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    if (previous && parseTimeToMinutes(slot.time) - parseTimeToMinutes(previous.time) === settings.reservationTimeStep) run.push(slot);
    else runs.push([slot]);
  }
  const full = runs.flatMap(run => groupCapacityTimelineSegments(run).filter(segment => segment.availability === "full"));

  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-[#C9A88B]" aria-hidden />{copy.title}</h3>
      <time dateTime={dateIso} className="text-xs tabular-nums text-[var(--muted)]">{dateIso}</time>
    </div>
    {!settings.reservationCapacityLimitsEnabled && <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-200">{copy.disabled}</p>}
    {error ? <div role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-300">
      <p>{copy.error}</p>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-current/20 px-2 text-xs">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />{copy.retry}
      </button>
    </div> : !loaded ? <p role="status" className="mt-3 text-sm text-[var(--muted)]">{copy.loading}</p>
      : full.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {full.map(segment => <li key={segment.startTime} className="flex items-center justify-between gap-2 rounded-xl border border-rose-300/30 bg-rose-500/[0.06] px-3 py-2.5">
          <span className="text-sm font-semibold tabular-nums">{segment.startTime}{segment.endTime !== segment.startTime ? ` – ${segment.endTime}` : ""}</span>
          <span className="text-xs font-medium text-rose-700 dark:text-rose-200">{copy.full}</span>
        </li>)}
      </ul> : <p className="mt-3 text-sm text-[var(--muted)]">{futureSlots.length ? copy.clear : copy.closed}</p>}
  </section>;
}
