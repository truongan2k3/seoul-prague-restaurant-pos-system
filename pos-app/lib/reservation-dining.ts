export const DINING_TIME_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240] as const;

export function isDiningTime(value: unknown): boolean {
  return typeof value === "number" && DINING_TIME_OPTIONS.some((minutes) => minutes === value);
}

/** Missing values on historical bookings retain the venue's configured default. */
export function reservationDiningMinutes(row: { diningDurationMinutes?: number | null }, fallback = 90): number {
  const value = row.diningDurationMinutes;
  return typeof value === "number" && Number.isInteger(value) && value >= 30 && value <= 240 ? value : fallback;
}

const COPY = {
  en: { title: "Dining time", hint: "How long do you expect to stay? This helps us plan your table.", hour: "h", minute: "min", unassign: "Drop here to unassign", unassignHint: "Or select a booking, then tap here" },
  cs: { title: "Délka návštěvy", hint: "Jak dlouho plánujete zůstat? Pomůže nám to připravit váš stůl.", hour: "h", minute: "min", unassign: "Přetažením zrušit přiřazení", unassignHint: "Nebo vyberte rezervaci a klepněte sem" },
  vi: { title: "Thời gian dùng bữa", hint: "Bạn dự kiến ngồi bao lâu? Nhà hàng sẽ dựa vào đó để sắp xếp bàn.", hour: "giờ", minute: "phút", unassign: "Thả vào đây để gỡ xếp bàn", unassignHint: "Hoặc chọn đặt bàn rồi chạm vào đây" },
  de: { title: "Aufenthaltsdauer", hint: "Wie lange möchten Sie bleiben? Das hilft uns bei der Tischplanung.", hour: "Std.", minute: "Min.", unassign: "Hier ablegen, um die Zuordnung aufzuheben", unassignHint: "Oder Reservierung auswählen und hier tippen" },
  ko: { title: "식사 시간", hint: "예상 체류 시간을 선택해 주세요. 좌석 준비에 도움이 됩니다.", hour: "시간", minute: "분", unassign: "여기로 끌어 테이블 배정 해제", unassignHint: "예약을 선택한 후 여기를 눌러도 됩니다" },
};
export function diningTimeCopy(language: string) { return COPY[language as keyof typeof COPY] ?? COPY.en; }
export function formatDiningTime(minutes: number, language = "en") {
  const copy = diningTimeCopy(language);
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return [hours ? `${hours} ${copy.hour}` : "", remainder ? `${remainder} ${copy.minute}` : ""].filter(Boolean).join(" ");
}
