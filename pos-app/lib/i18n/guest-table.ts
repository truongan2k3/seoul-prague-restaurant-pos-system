export type GuestTableLang = "en" | "cs" | "vi" | "de" | "ko";

export const GUEST_TABLE_LANGS: GuestTableLang[] = ["en", "cs", "vi", "de", "ko"];

type GuestTableCopy = {
  tableTitle: string;
  subtitle: string;
  currentBill: string;
  emptyBill: string;
  total: string;
  callStaff: string;
  requestBanchan: string;
  requestGrill: string;
  requestPayment: string;
  visitWebsite: string;
  leaveReview: string;
  send: string;
  cancel: string;
  close: string;
  qty: string;
  card: string;
  cash: string;
  noteOptional: string;
  sent: string;
  sending: string;
  errorGeneric: string;
  tableUnavailable: string;
  pendingHint: string;
  selectBanchan: string;
  choosePayment: string;
  grillHint: string;
  language: string;
};

const COPY: Record<GuestTableLang, GuestTableCopy> = {
  en: {
    tableTitle: "Table {label}",
    subtitle: "How can we help?",
    currentBill: "Current bill",
    emptyBill: "No items on this table yet.",
    total: "Total",
    callStaff: "Call staff",
    requestBanchan: "Request banchan",
    requestGrill: "Request grill change",
    requestPayment: "Request payment",
    visitWebsite: "Visit website",
    leaveReview: "Google review",
    send: "Send request",
    cancel: "Cancel",
    close: "Close",
    qty: "Qty",
    card: "Card",
    cash: "Cash",
    noteOptional: "Note (optional)",
    sent: "Request sent — staff will help shortly.",
    sending: "Sending…",
    errorGeneric: "Something went wrong. Please try again.",
    tableUnavailable: "This table QR is not available.",
    pendingHint: "Staff have been notified.",
    selectBanchan: "Choose banchan & quantity",
    choosePayment: "How would you like to pay?",
    grillHint: "We’ll bring a fresh grill mesh to your table.",
    language: "Language",
  },
  cs: {
    tableTitle: "Stůl {label}",
    subtitle: "Jak vám můžeme pomoci?",
    currentBill: "Aktuální účet",
    emptyBill: "U tohoto stolu zatím nic není.",
    total: "Celkem",
    callStaff: "Zavolat obsluhu",
    requestBanchan: "Doplnit banchan",
    requestGrill: "Výměna grilu",
    requestPayment: "Požádat o platbu",
    visitWebsite: "Web restaurace",
    leaveReview: "Recenze Google",
    send: "Odeslat",
    cancel: "Zrušit",
    close: "Zavřít",
    qty: "Počet",
    card: "Kartou",
    cash: "Hotově",
    noteOptional: "Poznámka (volitelné)",
    sent: "Požadavek odeslán — obsluha brzy přijde.",
    sending: "Odesílám…",
    errorGeneric: "Něco se pokazilo. Zkuste to znovu.",
    tableUnavailable: "Tento QR stolu není dostupný.",
    pendingHint: "Obsluha byla upozorněna.",
    selectBanchan: "Vyberte banchan a množství",
    choosePayment: "Jak chcete platit?",
    grillHint: "Přineseme novou grilovací mřížku ke stolu.",
    language: "Jazyk",
  },
  vi: {
    tableTitle: "Bàn {label}",
    subtitle: "Bạn cần hỗ trợ gì?",
    currentBill: "Hóa đơn hiện tại",
    emptyBill: "Bàn chưa có món.",
    total: "Tổng",
    callStaff: "Gọi nhân viên",
    requestBanchan: "Xin banchan",
    requestGrill: "Đổi vỉ nướng",
    requestPayment: "Yêu cầu thanh toán",
    visitWebsite: "Xem website",
    leaveReview: "Đánh giá Google",
    send: "Gửi yêu cầu",
    cancel: "Hủy",
    close: "Đóng",
    qty: "SL",
    card: "Thẻ",
    cash: "Tiền mặt",
    noteOptional: "Ghi chú (tuỳ chọn)",
    sent: "Đã gửi — nhân viên sẽ tới sớm.",
    sending: "Đang gửi…",
    errorGeneric: "Có lỗi. Vui lòng thử lại.",
    tableUnavailable: "QR bàn này không khả dụng.",
    pendingHint: "Đã báo cho nhân viên.",
    selectBanchan: "Chọn banchan & số lượng",
    choosePayment: "Bạn muốn thanh toán thế nào?",
    grillHint: "Chúng tôi sẽ mang vỉ nướng mới ra bàn.",
    language: "Ngôn ngữ",
  },
  de: {
    tableTitle: "Tisch {label}",
    subtitle: "Wie können wir helfen?",
    currentBill: "Aktuelle Rechnung",
    emptyBill: "Noch keine Positionen an diesem Tisch.",
    total: "Summe",
    callStaff: "Personal rufen",
    requestBanchan: "Banchan nachbestellen",
    requestGrill: "Grillrost wechseln",
    requestPayment: "Zahlung anfordern",
    visitWebsite: "Website besuchen",
    leaveReview: "Google-Bewertung",
    send: "Anfrage senden",
    cancel: "Abbrechen",
    close: "Schließen",
    qty: "Anz.",
    card: "Karte",
    cash: "Bar",
    noteOptional: "Notiz (optional)",
    sent: "Anfrage gesendet — Personal kommt gleich.",
    sending: "Senden…",
    errorGeneric: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
    tableUnavailable: "Dieser Tisch-QR ist nicht verfügbar.",
    pendingHint: "Personal wurde benachrichtigt.",
    selectBanchan: "Banchan & Menge wählen",
    choosePayment: "Wie möchten Sie zahlen?",
    grillHint: "Wir bringen ein frisches Grillrost an Ihren Tisch.",
    language: "Sprache",
  },
  ko: {
    tableTitle: "{label}번 테이블",
    subtitle: "무엇을 도와드릴까요?",
    currentBill: "현재 주문",
    emptyBill: "아직 주문 내역이 없습니다.",
    total: "합계",
    callStaff: "직원 호출",
    requestBanchan: "반찬 요청",
    requestGrill: "불판 교체",
    requestPayment: "계산 요청",
    visitWebsite: "웹사이트",
    leaveReview: "구글 리뷰",
    send: "요청 보내기",
    cancel: "취소",
    close: "닫기",
    qty: "수량",
    card: "카드",
    cash: "현금",
    noteOptional: "메모 (선택)",
    sent: "요청이 전달되었습니다.",
    sending: "전송 중…",
    errorGeneric: "오류가 발생했습니다. 다시 시도해 주세요.",
    tableUnavailable: "이 테이블 QR은 사용할 수 없습니다.",
    pendingHint: "직원에게 알림이 전송되었습니다.",
    selectBanchan: "반찬과 수량을 선택하세요",
    choosePayment: "결제 방법을 선택하세요",
    grillHint: "새 불판을 테이블로 가져다 드리겠습니다.",
    language: "언어",
  },
};

export function guestTableCopy(lang: GuestTableLang): GuestTableCopy {
  return COPY[lang] ?? COPY.en;
}

export function resolveGuestTableLang(raw?: string | null): GuestTableLang {
  const value = (raw ?? "").toLowerCase().slice(0, 2);
  if (value === "cs" || value === "vi" || value === "de" || value === "ko") return value;
  return "en";
}

export function detectGuestTableLang(): GuestTableLang {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const entry of list) {
    const code = entry.toLowerCase().slice(0, 2);
    if (code === "cs" || code === "sk") return "cs";
    if (code === "vi") return "vi";
    if (code === "de") return "de";
    if (code === "ko") return "ko";
    if (code === "en") return "en";
  }
  return "en";
}
