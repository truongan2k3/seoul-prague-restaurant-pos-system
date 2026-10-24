import { ONLINE_SELF_SERVE_MAX_PARTY } from "@/lib/reservation-party-limits";
import type { GuestReservationLang } from "@/lib/reservation-guest-form";

export type GuestReservationCopy = {
  languageLabel: string;
  tagline: string;
  bookCta: string;
  location: string;
  getDirections: string;
  contact: string;
  openingHours: string;
  makeReservation: string;
  reserveSubtitle: string;
  yourName: string;
  emailAddress: string;
  phoneNumber: string;
  numberOfGuests: string;
  selectDate: string;
  selectTime: string;
  diningCourtesyNote: string;
  additionalNotes: string;
  eventType: string;
  selectEventType: string;
  bbqQuestion: string;
  bbqHint: string;
  bbqYes: string;
  bbqNo: string;
  bbqUndecided: string;
  guestSingular: string;
  guestPlural: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  notesPlaceholder: string;
  loadingTimes: string;
  noTimesAvailable: string;
  slotAvailable: string;
  slotLimited: string;
  slotFull: string;
  submitReservation: string;
  submitting: string;
  close: string;
  bookingCode: string;
  manageReservation: string;
  emailAfterConfirmNote: string;
  spamFolderReminder: string;
  gdprRequired: string;
  largePartyTitle: string;
  largePartyMessage: string;
  largePartyChatCta: string;
  largePartyOption: string;
  errorName: string;
  errorEmail: string;
  errorPhone: string;
  errorDateTime: string;
  errorBbq: string;
  errorAvailability: string;
  errorTimeUnavailable: string;
  retryAvailability: string;
  errorEventType: string;
  errorGdpr: string;
  errorSubmit: string;
  errorSubmitRetry: string;
};

const en: GuestReservationCopy = {
  languageLabel: "English",
  tagline: "Wanna try some authentic Korean vibes?\nBook your table now!",
  bookCta: "Book your table now!",
  location: "Location",
  getDirections: "Get Directions →",
  contact: "Contact",
  openingHours: "Opening Hours",
  makeReservation: "Make a Reservation",
  reserveSubtitle: "Reserve your table at SEOUL PRAGUE",
  yourName: "Your Name",
  emailAddress: "Email Address",
  phoneNumber: "Phone Number",
  numberOfGuests: "Number of Guests",
  selectDate: "Select Date",
  selectTime: "Select Time",
  diningCourtesyNote: "During busy periods, we kindly encourage you to enjoy your meal within 1 hour and 30 minutes. Thank you for your understanding.",
  additionalNotes: "Additional Notes",
  eventType: "Event Type",
  selectEventType: "Select event type",
  bbqQuestion: "Would you like Korean BBQ grilling?",
  bbqHint: "Your answer helps us prepare the best experience for you.",
  bbqYes: "Yes, BBQ please",
  bbqNo: "No, regular dining",
  bbqUndecided: "I don't know yet",
  guestSingular: "guest",
  guestPlural: "guests",
  namePlaceholder: "Full name",
  emailPlaceholder: "you@example.com",
  notesPlaceholder: "Dietary requirements, special requests…",
  loadingTimes: "Loading…",
  noTimesAvailable: "No times available",
  slotAvailable: "Available",
  slotLimited: "Limited — available",
  slotFull: "Unavailable",
  submitReservation: "Submit Reservation →",
  submitting: "Submitting…",
  close: "Close",
  bookingCode: "Booking code",
  manageReservation: "Manage reservation",
  emailAfterConfirmNote:
    "Confirmation email is sent after the restaurant confirms your reservation.",
  spamFolderReminder:
    "Please also check your Spam / Junk folder — the confirmation email may appear there.",
  gdprRequired: "Please agree to data processing before submitting.",
  largePartyTitle: "Large party",
  largePartyMessage:
    "For larger groups, contact our team via chat, email or phone to discuss availability.",
  largePartyChatCta: "Chat with us",
  largePartyOption: `${ONLINE_SELF_SERVE_MAX_PARTY}+`,
  errorName: "Please enter your name.",
  errorEmail: "Please enter your email.",
  errorPhone: "Please enter your phone number.",
  errorDateTime: "Please select a date and time.",
  errorBbq: "Please choose BBQ or regular dining first.",
  errorAvailability: "Could not check table availability. Please try again.",
  errorTimeUnavailable: "No suitable table is available at this time. Please choose another time.",
  retryAvailability: "Check availability again",
  errorEventType: "Please select an event type.",
  errorGdpr: "Please tick the consent box to continue.",
  errorSubmit: "Failed to submit reservation.",
  errorSubmitRetry: "Failed to submit reservation. Please try again.",
};

const cs: GuestReservationCopy = {
  languageLabel: "Čeština",
  tagline: "Chcete ochutnat autentickou korejskou atmosféru?\nRezervujte si stůl!",
  bookCta: "Rezervujte si stůl!",
  location: "Adresa",
  getDirections: "Navigovat →",
  contact: "Kontakt",
  openingHours: "Otevírací doba",
  makeReservation: "Rezervace stolu",
  reserveSubtitle: "Rezervace v SEOUL PRAGUE",
  yourName: "Vaše jméno",
  emailAddress: "E-mail",
  phoneNumber: "Telefon",
  numberOfGuests: "Počet hostů",
  selectDate: "Datum",
  selectTime: "Čas",
  diningCourtesyNote: "V době zvýšené návštěvnosti vás prosíme, abyste si své stolování užili během 1 hodiny a 30 minut. Děkujeme za pochopení.",
  additionalNotes: "Poznámka",
  eventType: "Typ akce",
  selectEventType: "Vyberte typ akce",
  bbqQuestion: "Máte zájem o korejské grilování?",
  bbqHint: "Vaše odpověď nám pomůže lépe se na vaši návštěvu připravit.",
  bbqYes: "Ano, grilování",
  bbqNo: "Ne, běžné stravování",
  bbqUndecided: "Ještě nevím",
  guestSingular: "host",
  guestPlural: "hostů",
  namePlaceholder: "Celé jméno",
  emailPlaceholder: "vy@example.cz",
  notesPlaceholder: "Alergie, speciální požadavky…",
  loadingTimes: "Načítání…",
  noTimesAvailable: "Žádné volné termíny",
  slotAvailable: "Volno",
  slotLimited: "Omezeně — stále možné",
  slotFull: "Nedostupné",
  submitReservation: "Odeslat rezervaci →",
  submitting: "Odesílání…",
  close: "Zavřít",
  bookingCode: "Kód rezervace",
  manageReservation: "Spravovat rezervaci",
  emailAfterConfirmNote:
    "Potvrzovací e-mail odešleme až po potvrzení rezervace restaurací.",
  spamFolderReminder:
    "Zkontrolujte prosím také složku Spam / Nevyžádaná — potvrzovací e-mail se může objevit tam.",
  gdprRequired: "Před odesláním prosím souhlaste se zpracováním údajů.",
  largePartyTitle: "Větší skupina",
  largePartyMessage:
    "Pro větší skupiny kontaktujte náš tým přes chat, e-mail nebo telefon.",
  largePartyChatCta: "Chat with us",
  largePartyOption: `${ONLINE_SELF_SERVE_MAX_PARTY}+`,
  errorName: "Zadejte prosím jméno.",
  errorEmail: "Zadejte prosím e-mail.",
  errorPhone: "Zadejte prosím telefon.",
  errorDateTime: "Vyberte prosím datum a čas.",
  errorBbq: "Nejprve vyberte BBQ nebo běžné stolování.",
  errorAvailability: "Dostupnost stolů se nepodařilo ověřit. Zkuste to znovu.",
  errorTimeUnavailable: "V tomto čase není dostupný vhodný stůl. Vyberte prosím jiný čas.",
  retryAvailability: "Znovu ověřit dostupnost",
  errorEventType: "Vyberte prosím typ akce.",
  errorGdpr: "Zaškrtněte prosím souhlas pro pokračování.",
  errorSubmit: "Rezervaci se nepodařilo odeslat.",
  errorSubmitRetry: "Rezervaci se nepodařilo odeslat. Zkuste to znovu.",
};

const vi: GuestReservationCopy = {
  languageLabel: "Tiếng Việt",
  tagline: "Muốn thử không khí Hàn Quốc đích thực?\nĐặt bàn ngay!",
  bookCta: "Đặt bàn ngay!",
  location: "Địa điểm",
  getDirections: "Chỉ đường →",
  contact: "Liên hệ",
  openingHours: "Giờ mở cửa",
  makeReservation: "Đặt bàn",
  reserveSubtitle: "Đặt bàn tại SEOUL PRAGUE",
  yourName: "Họ và tên",
  emailAddress: "Email",
  phoneNumber: "Số điện thoại",
  numberOfGuests: "Số khách",
  selectDate: "Chọn ngày",
  selectTime: "Chọn giờ",
  diningCourtesyNote: "Trong trường hợp nhà hàng đông, chúng tôi khuyến khích quý khách dùng bữa trong vòng 1 giờ 30 phút. Trân trọng và cảm ơn quý khách.",
  additionalNotes: "Ghi chú thêm",
  eventType: "Loại sự kiện",
  selectEventType: "Chọn loại sự kiện",
  bbqQuestion: "Bạn có muốn ăn nướng BBQ không?",
  bbqHint: "Trả lời giúp nhà hàng chuẩn bị tốt hơn cho bạn.",
  bbqYes: "Có, tôi muốn nướng",
  bbqNo: "Không, ăn bình thường",
  bbqUndecided: "Tôi chưa biết nữa",
  guestSingular: "khách",
  guestPlural: "khách",
  namePlaceholder: "Họ và tên",
  emailPlaceholder: "email@example.com",
  notesPlaceholder: "Yêu cầu đặc biệt, dị ứng thực phẩm…",
  loadingTimes: "Đang tải…",
  noTimesAvailable: "Không còn giờ trống",
  slotAvailable: "Còn chỗ",
  slotLimited: "Hạn chế — vẫn còn",
  slotFull: "Không còn bàn phù hợp",
  submitReservation: "Gửi đặt bàn →",
  submitting: "Đang gửi…",
  close: "Đóng",
  bookingCode: "Mã đặt bàn",
  manageReservation: "Quản lý đặt bàn",
  emailAfterConfirmNote:
    "Email xác nhận sẽ được gửi sau khi nhà hàng xác nhận đặt bàn của bạn.",
  spamFolderReminder:
    "Vui lòng kiểm tra thêm thư mục Spam / Thư rác — email xác nhận có thể nằm ở đó.",
  gdprRequired: "Vui lòng đồng ý xử lý dữ liệu trước khi gửi.",
  largePartyTitle: "Đoàn đông khách",
  largePartyMessage:
    "Đoàn đông khách vui lòng liên hệ nhân viên qua chat, email hoặc điện thoại để kiểm tra chỗ.",
  largePartyChatCta: "Chat with us",
  largePartyOption: `${ONLINE_SELF_SERVE_MAX_PARTY}+`,
  errorName: "Vui lòng nhập họ tên.",
  errorEmail: "Vui lòng nhập email.",
  errorPhone: "Vui lòng nhập số điện thoại.",
  errorDateTime: "Vui lòng chọn ngày và giờ.",
  errorBbq: "Vui lòng chọn có nướng hoặc không trước.",
  errorAvailability: "Chưa kiểm tra được bàn trống. Vui lòng thử lại.",
  errorTimeUnavailable: "Không có bàn phù hợp ở giờ này. Vui lòng chọn giờ khác.",
  retryAvailability: "Kiểm tra bàn trống lại",
  errorEventType: "Vui lòng chọn loại sự kiện.",
  errorGdpr: "Vui lòng tích vào ô đồng ý để tiếp tục.",
  errorSubmit: "Không gửi được đặt bàn.",
  errorSubmitRetry: "Không gửi được đặt bàn. Vui lòng thử lại.",
};

const de: GuestReservationCopy = {
  languageLabel: "Deutsch",
  tagline: "Lust auf authentische koreanische Atmosphäre?\nJetzt Tisch reservieren!",
  bookCta: "Jetzt Tisch reservieren!",
  location: "Standort",
  getDirections: "Route →",
  contact: "Kontakt",
  openingHours: "Öffnungszeiten",
  makeReservation: "Tisch reservieren",
  reserveSubtitle: "Reservieren Sie bei SEOUL PRAGUE",
  yourName: "Ihr Name",
  emailAddress: "E-Mail-Adresse",
  phoneNumber: "Telefonnummer",
  numberOfGuests: "Anzahl der Gäste",
  selectDate: "Datum wählen",
  selectTime: "Uhrzeit wählen",
  diningCourtesyNote: "Bei hohem Gästeaufkommen bitten wir Sie freundlich, Ihre Mahlzeit innerhalb von 1 Stunde und 30 Minuten zu genießen. Vielen Dank für Ihr Verständnis.",
  additionalNotes: "Zusätzliche Hinweise",
  eventType: "Anlass",
  selectEventType: "Anlass wählen",
  bbqQuestion: "Möchten Sie koreanisches BBQ-Grillen?",
  bbqHint: "Ihre Antwort hilft uns, das beste Erlebnis für Sie vorzubereiten.",
  bbqYes: "Ja, BBQ bitte",
  bbqNo: "Nein, normales Essen",
  bbqUndecided: "Weiß ich noch nicht",
  guestSingular: "Gast",
  guestPlural: "Gäste",
  namePlaceholder: "Vollständiger Name",
  emailPlaceholder: "sie@beispiel.de",
  notesPlaceholder: "Ernährungswünsche, besondere Wünsche…",
  loadingTimes: "Laden…",
  noTimesAvailable: "Keine Zeiten verfügbar",
  slotAvailable: "Verfügbar",
  slotLimited: "Begrenzt — noch möglich",
  slotFull: "Nicht verfügbar",
  submitReservation: "Reservierung senden →",
  submitting: "Wird gesendet…",
  close: "Schließen",
  bookingCode: "Buchungscode",
  manageReservation: "Reservierung verwalten",
  emailAfterConfirmNote:
    "Die Bestätigungs-E-Mail wird gesendet, nachdem das Restaurant Ihre Reservierung bestätigt hat.",
  spamFolderReminder:
    "Bitte prüfen Sie auch den Spam- / Junk-Ordner — die Bestätigungs-E-Mail kann dort landen.",
  gdprRequired: "Bitte stimmen Sie der Datenverarbeitung zu, bevor Sie absenden.",
  largePartyTitle: "Große Gruppe",
  largePartyMessage:
    "Für größere Gruppen kontaktieren Sie unser Team per Chat, E-Mail oder Telefon.",
  largePartyChatCta: "Chat with us",
  largePartyOption: `${ONLINE_SELF_SERVE_MAX_PARTY}+`,
  errorName: "Bitte geben Sie Ihren Namen ein.",
  errorEmail: "Bitte geben Sie Ihre E-Mail ein.",
  errorPhone: "Bitte geben Sie Ihre Telefonnummer ein.",
  errorDateTime: "Bitte wählen Sie Datum und Uhrzeit.",
  errorBbq: "Bitte wählen Sie zuerst BBQ oder reguläres Essen.",
  errorAvailability: "Die Tischverfügbarkeit konnte nicht geprüft werden. Bitte versuchen Sie es erneut.",
  errorTimeUnavailable: "Zu dieser Zeit ist kein passender Tisch verfügbar. Bitte wählen Sie eine andere Zeit.",
  retryAvailability: "Verfügbarkeit erneut prüfen",
  errorEventType: "Bitte wählen Sie einen Anlass.",
  errorGdpr: "Bitte aktivieren Sie das Einverständnis-Kästchen.",
  errorSubmit: "Reservierung konnte nicht gesendet werden.",
  errorSubmitRetry: "Reservierung konnte nicht gesendet werden. Bitte erneut versuchen.",
};

const ko: GuestReservationCopy = {
  languageLabel: "한국어",
  tagline: "진짜 한국 분위기를 느껴보세요.\n지금 테이블을 예약하세요!",
  bookCta: "지금 테이블을 예약하세요!",
  location: "위치",
  getDirections: "길 찾기 →",
  contact: "연락처",
  openingHours: "영업 시간",
  makeReservation: "예약하기",
  reserveSubtitle: "SEOUL PRAGUE 예약",
  yourName: "이름",
  emailAddress: "이메일",
  phoneNumber: "전화번호",
  numberOfGuests: "인원",
  selectDate: "날짜 선택",
  selectTime: "시간 선택",
  diningCourtesyNote: "매장이 혼잡한 경우, 식사 시간을 1시간 30분 이내로 이용해 주시면 감사하겠습니다. 고객님의 이해와 협조에 진심으로 감사드립니다.",
  additionalNotes: "추가 요청",
  eventType: "행사 유형",
  selectEventType: "행사 유형 선택",
  bbqQuestion: "한국 BBQ 그릴을 원하시나요?",
  bbqHint: "응답은 최고의 경험을 준비하는 데 도움이 됩니다.",
  bbqYes: "네, BBQ 원합니다",
  bbqNo: "아니요, 일반 식사",
  bbqUndecided: "아직 모르겠어요",
  guestSingular: "명",
  guestPlural: "명",
  namePlaceholder: "이름",
  emailPlaceholder: "you@example.com",
  notesPlaceholder: "알레르기, 특별 요청…",
  loadingTimes: "불러오는 중…",
  noTimesAvailable: "예약 가능한 시간 없음",
  slotAvailable: "예약 가능",
  slotLimited: "여유 적음 — 예약 가능",
  slotFull: "예약 불가",
  submitReservation: "예약 제출 →",
  submitting: "제출 중…",
  close: "닫기",
  bookingCode: "예약 코드",
  manageReservation: "예약 관리",
  emailAfterConfirmNote:
    "확인 메일은 레스토랑이 예약을 확인한 후에 발송됩니다.",
  spamFolderReminder:
    "스팸/정크 메일함도 확인해 주세요 — 확인 메일이 그곳에 있을 수 있습니다.",
  gdprRequired: "제출 전에 데이터 처리에 동의해 주세요.",
  largePartyTitle: "단체 예약",
  largePartyMessage:
    "단체 예약은 채팅, 이메일 또는 전화로 직원에게 문의해 주세요.",
  largePartyChatCta: "Chat with us",
  largePartyOption: `${ONLINE_SELF_SERVE_MAX_PARTY}+`,
  errorName: "이름을 입력해 주세요.",
  errorEmail: "이메일을 입력해 주세요.",
  errorPhone: "전화번호를 입력해 주세요.",
  errorDateTime: "날짜와 시간을 선택해 주세요.",
  errorBbq: "먼저 BBQ 또는 일반 식사를 선택해 주세요.",
  errorAvailability: "테이블 예약 가능 여부를 확인할 수 없습니다. 다시 시도해 주세요.",
  errorTimeUnavailable: "이 시간에는 적합한 테이블이 없습니다. 다른 시간을 선택해 주세요.",
  retryAvailability: "예약 가능 여부 다시 확인",
  errorEventType: "행사 유형을 선택해 주세요.",
  errorGdpr: "동의 체크박스를 선택해 주세요.",
  errorSubmit: "예약을 제출하지 못했습니다.",
  errorSubmitRetry: "예약을 제출하지 못했습니다. 다시 시도해 주세요.",
};

export const GUEST_RESERVATION_COPY: Record<GuestReservationLang, GuestReservationCopy> = {
  en,
  cs,
  vi,
  de,
  ko,
};

export function guestReservationCopy(lang: GuestReservationLang): GuestReservationCopy {
  return GUEST_RESERVATION_COPY[lang] ?? GUEST_RESERVATION_COPY.en;
}

export const GUEST_LANG_SESSION_KEY = "reservation-guest-lang";
export const GUEST_LANG_CHANGE_EVENT = "guest-reservation-lang-change";

export function persistGuestReservationLang(lang: GuestReservationLang) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GUEST_LANG_SESSION_KEY, lang);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(GUEST_LANG_CHANGE_EVENT, { detail: lang }));
}

export function parseGuestReservationLang(value: string | null | undefined): GuestReservationLang {
  if (
    value === "cs" ||
    value === "vi" ||
    value === "de" ||
    value === "ko" ||
    value === "en"
  ) {
    return value;
  }
  return "en";
}

/**
 * Map a BCP-47 tag (e.g. `vi-VN`, `cs`) to a supported guest reservation language.
 * Unknown languages fall back to English.
 */
export function matchGuestReservationLang(tag: string | null | undefined): GuestReservationLang | null {
  if (!tag) return null;
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;

  const primary = normalized.split("-")[0] ?? "";
  if (
    primary === "cs" ||
    primary === "vi" ||
    primary === "de" ||
    primary === "ko" ||
    primary === "en"
  ) {
    return primary;
  }

  // Occasional browser tags that still map cleanly.
  if (normalized.startsWith("cz")) return "cs";
  if (normalized.startsWith("vn")) return "vi";
  return null;
}

/** Prefer session choice; otherwise detect from the device / browser; default English. */
export function resolveInitialGuestReservationLang(
  stored: string | null | undefined,
  languages: readonly string[] = [],
): GuestReservationLang {
  if (stored) return parseGuestReservationLang(stored);

  for (const tag of languages) {
    const matched = matchGuestReservationLang(tag);
    if (matched) return matched;
  }
  return "en";
}

/** Read navigator language list when available (browser only). */
export function detectGuestReservationLangFromNavigator(): GuestReservationLang {
  if (typeof navigator === "undefined") return "en";
  const list: string[] = [];
  if (Array.isArray(navigator.languages)) {
    list.push(...navigator.languages);
  }
  if (navigator.language) list.push(navigator.language);
  return resolveInitialGuestReservationLang(null, list);
}

