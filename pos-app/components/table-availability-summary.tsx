import { Clock3 } from "lucide-react";
import { RESERVATION_FLOOR_TABLES } from "@/lib/reservation-floor-plan";
import type { LiveTableAvailability, TableAvailabilitySource } from "@/lib/table-availability";
import type { LanguageCode } from "@/lib/types";

const LONG_FREE_WINDOW_MS = 150 * 60_000;
const COPY = {
  en: {
    loading: "Updating table availability…", offline: "Live availability unavailable — ask staff.",
    all: "All tables are available.", available: "Available tables", until: "until",
    more: "more", none: "No tables available now.", seated: "Time seated",
    minutes: "min", hours: "h",
  },
  cs: {
    loading: "Aktualizuji dostupnost stolů…", offline: "Živá dostupnost není k dispozici — zeptejte se obsluhy.",
    all: "Všechny stoly jsou volné.", available: "Volné stoly", until: "do",
    more: "dalších", none: "Momentálně není žádný stůl volný.", seated: "Doba u stolu",
    minutes: "min", hours: "h",
  },
  vi: {
    loading: "Đang cập nhật tình trạng bàn…", offline: "Chưa thể cập nhật tình trạng bàn — vui lòng hỏi nhân viên.",
    all: "Tất cả các bàn đều đang khả dụng.", available: "Đang có bàn", until: "khả dụng tới",
    more: "bàn khác", none: "Hiện không có bàn khả dụng.", seated: "Đã ngồi",
    minutes: "phút", hours: "h",
  },
  zh: {
    loading: "正在更新餐桌状态…", offline: "暂时无法获取实时餐桌状态，请询问工作人员。",
    all: "所有餐桌均可使用。", available: "可用餐桌", until: "可用至",
    more: "张其他桌", none: "目前没有可用餐桌。", seated: "已入座",
    minutes: "分钟", hours: "小时",
  },
} as const;

/** Read-only summary: estimates never turn an occupied table into an available one. */
export function TableAvailabilitySummary({ source, tables, now, language, live, error }: {
  source: TableAvailabilitySource | null;
  tables: LiveTableAvailability[];
  now: number;
  language: LanguageCode;
  live: boolean;
  error: boolean;
}) {
  const copy = COPY[language];
  const available = tables.filter(table => table.status === "available")
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const formatTime = (at: number) => {
    const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" });
    return new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : language === "vi" ? "vi-VN" : "en-GB", {
      timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      ...(sameDay.format(now) === sameDay.format(at) ? {} : { day: "numeric" as const, month: "short" as const }),
    }).format(at);
  };
  const duration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}${copy.hours}${rest ? ` ${rest} ${copy.minutes}` : ""}` : `${minutes} ${copy.minutes}`;
  };
  let text: string = copy.loading;
  if (error || (source && !live)) text = copy.offline;
  else if (live && source) {
    if (available.length) {
      const deadlines = available.map(table => table.availableUntil).filter((at): at is number => at !== null);
      const until = deadlines.length ? Math.min(...deadlines) : null;
      const allReady = RESERVATION_FLOOR_TABLES.every(def => available.some(table => table.label === def.label));
      if (allReady && (until === null || until - now > LONG_FREE_WINDOW_MS)) text = copy.all;
      else {
        const labels = available.slice(0, 3).map(table => table.label).join(", ");
        const more = available.length > 3 ? ` (+${available.length - 3} ${copy.more})` : "";
        text = `${copy.available} ${labels}${more}${until !== null ? ` ${copy.until} ${formatTime(until)}` : language === "vi" ? " khả dụng" : ""}.`;
      }
    } else {
      const occupied = tables.filter(table => table.occupied).flatMap(table => {
        let since = table.occupiedAt ? new Date(table.occupiedAt).getTime() : NaN;
        if (!Number.isFinite(since) || since > now) {
          const checkIns = source.reservations.filter(booking => booking.status === "checked_in"
            && [booking.tableLabel, booking.secondaryTableLabel, booking.tertiaryTableLabel]
              .some(label => label?.trim().toUpperCase() === table.label))
            .map(booking => booking.checkedInAt ? new Date(booking.checkedInAt).getTime() : NaN)
            .filter(at => Number.isFinite(at) && at <= now);
          since = checkIns.length ? Math.min(...checkIns) : NaN;
        }
        return Number.isFinite(since) && since <= now ? [{ label: table.label, since }] : [];
      }).sort((a, b) => a.since - b.since || a.label.localeCompare(b.label, undefined, { numeric: true })).slice(0, 3);
      const seated = occupied.map(table => `${table.label} ${duration(Math.floor((now - table.since) / 60_000))}`).join(" · ");
      text = `${copy.none}${seated ? ` ${copy.seated}: ${seated}.` : ""}`;
    }
  }

  return <div role="status" aria-live="polite" aria-atomic="true"
    className="mb-3 flex items-start gap-2 rounded-xl border border-[#C9A88B]/20 bg-[#171719] px-3 py-2.5 text-xs leading-relaxed text-[#E8D5C4]">
    <Clock3 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${live && available.length ? "text-emerald-300" : "text-[#C9A88B]"}`} aria-hidden />
    <p>{text}</p>
  </div>;
}
