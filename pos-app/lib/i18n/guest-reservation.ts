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
  additionalNotes: string;
  eventType: string;
  selectEventType: string;
  guestSingular: string;
  guestPlural: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  notesPlaceholder: string;
  loadingTimes: string;
  noTimesAvailable: string;
  submitReservation: string;
  submitting: string;
  close: string;
  bookingCode: string;
  manageReservation: string;
  gdprRequired: string;
  errorName: string;
  errorEmail: string;
  errorPhone: string;
  errorDateTime: string;
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
  additionalNotes: "Additional Notes",
  eventType: "Event Type",
  selectEventType: "Select event type",
  guestSingular: "guest",
  guestPlural: "guests",
  namePlaceholder: "Full name",
  emailPlaceholder: "you@example.com",
  notesPlaceholder: "Dietary requirements, special requests…",
  loadingTimes: "Loading…",
  noTimesAvailable: "No times available",
  submitReservation: "Submit Reservation →",
  submitting: "Submitting…",
  close: "Close",
  bookingCode: "Booking code",
  manageReservation: "Manage reservation",
  gdprRequired: "Please agree to data processing before submitting.",
  errorName: "Please enter your name.",
  errorEmail: "Please enter your email.",
  errorPhone: "Please enter your phone number.",
  errorDateTime: "Please select a date and time.",
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
  additionalNotes: "Poznámka",
  eventType: "Typ akce",
  selectEventType: "Vyberte typ akce",
  guestSingular: "host",
  guestPlural: "hostů",
  namePlaceholder: "Celé jméno",
  emailPlaceholder: "vy@example.cz",
  notesPlaceholder: "Alergie, speciální požadavky…",
  loadingTimes: "Načítání…",
  noTimesAvailable: "Žádné volné termíny",
  submitReservation: "Odeslat rezervaci →",
  submitting: "Odesílání…",
  close: "Zavřít",
  bookingCode: "Kód rezervace",
  manageReservation: "Spravovat rezervaci",
  gdprRequired: "Před odesláním prosím souhlaste se zpracováním údajů.",
  errorName: "Zadejte prosím jméno.",
  errorEmail: "Zadejte prosím e-mail.",
  errorPhone: "Zadejte prosím telefon.",
  errorDateTime: "Vyberte prosím datum a čas.",
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
  additionalNotes: "Ghi chú thêm",
  eventType: "Loại sự kiện",
  selectEventType: "Chọn loại sự kiện",
  guestSingular: "khách",
  guestPlural: "khách",
  namePlaceholder: "Họ và tên",
  emailPlaceholder: "email@example.com",
  notesPlaceholder: "Yêu cầu đặc biệt, dị ứng thực phẩm…",
  loadingTimes: "Đang tải…",
  noTimesAvailable: "Không còn giờ trống",
  submitReservation: "Gửi đặt bàn →",
  submitting: "Đang gửi…",
  close: "Đóng",
  bookingCode: "Mã đặt bàn",
  manageReservation: "Quản lý đặt bàn",
  gdprRequired: "Vui lòng đồng ý xử lý dữ liệu trước khi gửi.",
  errorName: "Vui lòng nhập họ tên.",
  errorEmail: "Vui lòng nhập email.",
  errorPhone: "Vui lòng nhập số điện thoại.",
  errorDateTime: "Vui lòng chọn ngày và giờ.",
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
  additionalNotes: "Zusätzliche Hinweise",
  eventType: "Anlass",
  selectEventType: "Anlass wählen",
  guestSingular: "Gast",
  guestPlural: "Gäste",
  namePlaceholder: "Vollständiger Name",
  emailPlaceholder: "sie@beispiel.de",
  notesPlaceholder: "Ernährungswünsche, besondere Wünsche…",
  loadingTimes: "Laden…",
  noTimesAvailable: "Keine Zeiten verfügbar",
  submitReservation: "Reservierung senden →",
  submitting: "Wird gesendet…",
  close: "Schließen",
  bookingCode: "Buchungscode",
  manageReservation: "Reservierung verwalten",
  gdprRequired: "Bitte stimmen Sie der Datenverarbeitung zu, bevor Sie absenden.",
  errorName: "Bitte geben Sie Ihren Namen ein.",
  errorEmail: "Bitte geben Sie Ihre E-Mail ein.",
  errorPhone: "Bitte geben Sie Ihre Telefonnummer ein.",
  errorDateTime: "Bitte wählen Sie Datum und Uhrzeit.",
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
  additionalNotes: "추가 요청",
  eventType: "행사 유형",
  selectEventType: "행사 유형 선택",
  guestSingular: "명",
  guestPlural: "명",
  namePlaceholder: "이름",
  emailPlaceholder: "you@example.com",
  notesPlaceholder: "알레르기, 특별 요청…",
  loadingTimes: "불러오는 중…",
  noTimesAvailable: "예약 가능한 시간 없음",
  submitReservation: "예약 제출 →",
  submitting: "제출 중…",
  close: "닫기",
  bookingCode: "예약 코드",
  manageReservation: "예약 관리",
  gdprRequired: "제출 전에 데이터 처리에 동의해 주세요.",
  errorName: "이름을 입력해 주세요.",
  errorEmail: "이메일을 입력해 주세요.",
  errorPhone: "전화번호를 입력해 주세요.",
  errorDateTime: "날짜와 시간을 선택해 주세요.",
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
