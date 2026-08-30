export type GuestReservationLang = "en" | "vi" | "de" | "ko";

export const GUEST_RESERVATION_LANGS: GuestReservationLang[] = ["en", "vi", "de", "ko"];

export type ReservationFormFieldKey =
  | "name"
  | "email"
  | "phone"
  | "guestCount"
  | "date"
  | "time"
  | "notes"
  | "eventType";

export type ReservationRequiredFields = Record<ReservationFormFieldKey, boolean>;

export type LocalizedGuestText = Record<GuestReservationLang, string>;

export type ReservationEventTypeOption = {
  id: string;
  labels: LocalizedGuestText;
};

export type ReservationGuestTexts = {
  emailHint: LocalizedGuestText;
  successTitle: LocalizedGuestText;
  successBody: LocalizedGuestText;
  successEmailSent: LocalizedGuestText;
  successManageLink: LocalizedGuestText;
  gdprConsent: LocalizedGuestText;
};

export type ReservationGuestFormConfig = {
  requiredFields: ReservationRequiredFields;
  eventTypes: ReservationEventTypeOption[];
  texts: ReservationGuestTexts;
  venue: ReservationGuestVenue;
};

export type ReservationGuestVenue = {
  restaurantName: string;
  address: string;
  phone: string;
  email: string;
};

export const DEFAULT_RESERVATION_GUEST_VENUE: ReservationGuestVenue = {
  restaurantName: "SEOUL PRAGUE Korean BBQ",
  address: "Václavské nám. 819/43, 110 00 Praha",
  phone: "+420 123 456 789",
  email: "info@seoulprague.cz",
};

export const RESERVATION_FORM_FIELD_KEYS: ReservationFormFieldKey[] = [
  "name",
  "email",
  "phone",
  "guestCount",
  "date",
  "time",
  "notes",
  "eventType",
];

function emptyLocalizedText(): LocalizedGuestText {
  return { en: "", vi: "", de: "", ko: "" };
}

function parseLocalizedText(value: unknown, fallback: LocalizedGuestText): LocalizedGuestText {
  if (!value || typeof value !== "object") return { ...fallback };
  const row = value as Record<string, unknown>;
  const next = { ...fallback };
  for (const lang of GUEST_RESERVATION_LANGS) {
    const text = row[lang];
    if (typeof text === "string") next[lang] = text;
  }
  return next;
}

export const DEFAULT_RESERVATION_REQUIRED_FIELDS: ReservationRequiredFields = {
  name: true,
  email: true,
  phone: true,
  guestCount: true,
  date: true,
  time: true,
  notes: false,
  eventType: false,
};

export const DEFAULT_RESERVATION_EVENT_TYPES: ReservationEventTypeOption[] = [
  {
    id: "casual",
    labels: {
      en: "Casual dining",
      vi: "Ăn uống thông thường",
      de: "Lockeres Essen",
      ko: "일반 식사",
    },
  },
  {
    id: "birthday",
    labels: {
      en: "Birthday",
      vi: "Sinh nhật",
      de: "Geburtstag",
      ko: "생일",
    },
  },
  {
    id: "anniversary",
    labels: {
      en: "Anniversary",
      vi: "Kỷ niệm",
      de: "Jubiläum",
      ko: "기념일",
    },
  },
  {
    id: "meeting",
    labels: {
      en: "Meeting",
      vi: "Họp mặt",
      de: "Meeting",
      ko: "모임",
    },
  },
];

export const DEFAULT_RESERVATION_GUEST_TEXTS: ReservationGuestTexts = {
  emailHint: {
    en: "Enter your email so we can send a confirmation.",
    vi: "Nhập email để chúng tôi gửi mail xác nhận.",
    de: "Geben Sie Ihre E-Mail ein, damit wir eine Bestätigung senden können.",
    ko: "확인 메일을 받으실 이메일을 입력해 주세요.",
  },
  successTitle: {
    en: "Reservation Received",
    vi: "Đã nhận đặt bàn",
    de: "Reservierung erhalten",
    ko: "예약 접수 완료",
  },
  successBody: {
    en: "Thank you! Your reservation request has been submitted. Our team will confirm your booking shortly.",
    vi: "Cảm ơn bạn! Yêu cầu đặt bàn đã được gửi. Nhân viên sẽ xác nhận sớm.",
    de: "Vielen Dank! Ihre Reservierungsanfrage wurde übermittelt. Unser Team bestätigt Ihre Buchung in Kürze.",
    ko: "감사합니다! 예약 요청이 접수되었습니다. 곧 예약을 확인해 드리겠습니다.",
  },
  successEmailSent: {
    en: "We emailed you a confirmation request and a link to change or cancel anytime.",
    vi: "Chúng tôi đã gửi email xác nhận và liên kết để bạn có thể đổi hoặc hủy bất cứ lúc nào.",
    de: "Wir haben Ihnen eine Bestätigungs-E-Mail mit Link zum Ändern oder Stornieren gesendet.",
    ko: "확인 메일과 예약 변경·취소 링크를 보내 드렸습니다.",
  },
  successManageLink: {
    en: "Save this link to manage your booking:",
    vi: "Lưu liên kết này để quản lý đặt bàn:",
    de: "Speichern Sie diesen Link zur Verwaltung Ihrer Buchung:",
    ko: "예약 관리를 위해 이 링크를 저장해 주세요:",
  },
  gdprConsent: {
    en: "By submitting this reservation, I agree that the restaurant may process the personal data I provide to prepare and manage my table booking.",
    vi: "Bằng việc gửi đặt bàn, tôi đồng ý cho nhà hàng xử lý dữ liệu cá nhân tôi cung cấp nhằm chuẩn bị và quản lý bàn đặt.",
    de: "Mit dem Absenden stimme ich zu, dass das Restaurant meine personenbezogenen Daten zur Vorbereitung und Verwaltung meiner Reservierung verarbeiten darf.",
    ko: "예약을 제출함으로써, 제공한 개인정보를 예약 준비 및 관리 목적으로 처리하는 것에 동의합니다.",
  },
};

export function parseReservationRequiredFields(value: unknown): ReservationRequiredFields {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RESERVATION_REQUIRED_FIELDS };
  }
  const row = value as Record<string, unknown>;
  const next = { ...DEFAULT_RESERVATION_REQUIRED_FIELDS };
  for (const key of RESERVATION_FORM_FIELD_KEYS) {
    if (typeof row[key] === "boolean") next[key] = row[key];
  }
  return next;
}

function parseEventTypeOption(value: unknown, index: number): ReservationEventTypeOption | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim()
      : `event-${index + 1}`;
  const fallback = DEFAULT_RESERVATION_EVENT_TYPES.find((item) => item.id === id);
  const labels = parseLocalizedText(
    row.labels,
    fallback?.labels ?? {
      ...emptyLocalizedText(),
      en: id,
    },
  );
  if (!labels.en.trim() && !labels.vi.trim() && !labels.de.trim() && !labels.ko.trim()) {
    return null;
  }
  return { id, labels };
}

export function parseReservationEventTypes(value: unknown): ReservationEventTypeOption[] {
  if (!Array.isArray(value)) return [...DEFAULT_RESERVATION_EVENT_TYPES];
  const parsed = value
    .map((row, index) => parseEventTypeOption(row, index))
    .filter((row): row is ReservationEventTypeOption => Boolean(row));
  return parsed.length > 0 ? parsed : [...DEFAULT_RESERVATION_EVENT_TYPES];
}

export function parseReservationGuestTexts(value: unknown): ReservationGuestTexts {
  if (!value || typeof value !== "object") {
    return {
      emailHint: { ...DEFAULT_RESERVATION_GUEST_TEXTS.emailHint },
      successTitle: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successTitle },
      successBody: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successBody },
      successEmailSent: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successEmailSent },
      successManageLink: { ...DEFAULT_RESERVATION_GUEST_TEXTS.successManageLink },
      gdprConsent: { ...DEFAULT_RESERVATION_GUEST_TEXTS.gdprConsent },
    };
  }
  const row = value as Record<string, unknown>;
  return {
    emailHint: parseLocalizedText(row.emailHint, DEFAULT_RESERVATION_GUEST_TEXTS.emailHint),
    successTitle: parseLocalizedText(row.successTitle, DEFAULT_RESERVATION_GUEST_TEXTS.successTitle),
    successBody: parseLocalizedText(row.successBody, DEFAULT_RESERVATION_GUEST_TEXTS.successBody),
    successEmailSent: parseLocalizedText(
      row.successEmailSent,
      DEFAULT_RESERVATION_GUEST_TEXTS.successEmailSent,
    ),
    successManageLink: parseLocalizedText(
      row.successManageLink,
      DEFAULT_RESERVATION_GUEST_TEXTS.successManageLink,
    ),
    gdprConsent: parseLocalizedText(row.gdprConsent, DEFAULT_RESERVATION_GUEST_TEXTS.gdprConsent),
  };
}

export function parseReservationGuestVenue(value: unknown): ReservationGuestVenue {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RESERVATION_GUEST_VENUE };
  }
  const row = value as Record<string, unknown>;
  return {
    restaurantName:
      typeof row.restaurantName === "string" && row.restaurantName.trim()
        ? row.restaurantName.trim()
        : DEFAULT_RESERVATION_GUEST_VENUE.restaurantName,
    address:
      typeof row.address === "string" && row.address.trim()
        ? row.address.trim()
        : DEFAULT_RESERVATION_GUEST_VENUE.address,
    phone:
      typeof row.phone === "string" && row.phone.trim()
        ? row.phone.trim()
        : DEFAULT_RESERVATION_GUEST_VENUE.phone,
    email:
      typeof row.email === "string" && row.email.trim()
        ? row.email.trim()
        : DEFAULT_RESERVATION_GUEST_VENUE.email,
  };
}

export function getGuestFormConfig(settings: {
  reservationRequiredFields: ReservationRequiredFields;
  reservationEventTypes: ReservationEventTypeOption[];
  reservationGuestTexts: ReservationGuestTexts;
  reservationGuestVenue: ReservationGuestVenue;
}): ReservationGuestFormConfig {
  return {
    requiredFields: settings.reservationRequiredFields,
    eventTypes: settings.reservationEventTypes,
    texts: settings.reservationGuestTexts,
    venue: settings.reservationGuestVenue,
  };
}

export function pickLocalizedText(text: LocalizedGuestText, lang: GuestReservationLang): string {
  const preferred = text[lang]?.trim();
  if (preferred) return preferred;
  for (const fallbackLang of GUEST_RESERVATION_LANGS) {
    const fallback = text[fallbackLang]?.trim();
    if (fallback) return fallback;
  }
  return "";
}

export function pickEventTypeLabel(
  option: ReservationEventTypeOption,
  lang: GuestReservationLang,
): string {
  return pickLocalizedText(option.labels, lang) || option.id;
}
