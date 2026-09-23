import type { GuestReservationLang } from "@/lib/reservation-guest-form";

export type GuestVoucherCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  loading: string;
  unavailable: string;
  stepChoose: string;
  stepChooseHint: string;
  stepQuantity: string;
  quantityLabel: string;
  stepDetails: string;
  fullName: string;
  fullNamePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  phone: string;
  phonePlaceholder: string;
  stepPayment: string;
  czechQrTitle: string;
  czechQrHint: string;
  bankTransferTitle: string;
  bankTransferHint: string;
  termsTitle: string;
  termValidity: string;
  termCounter: string;
  termNoCash: string;
  termContact: string;
  placeOrder: string;
  placingOrder: string;
  detailsRequired: string;
  bankNotConfigured: string;
  completePayment: string;
  paymentSubmitted: string;
  orderCancelled: string;
  cancelledBody: string;
  paidBodyBefore: string;
  paidBodyAfter: string;
  payNowBodyBefore: string;
  payNowBodyStrong: string;
  payNowBodyAfter: string;
  timeLeft: string;
  orderId: string;
  voucher: string;
  total: string;
  accountHolder: string;
  account: string;
  iban: string;
  bank: string;
  message: string;
  scanQrHint: string;
  saveQr: string;
  ivePaid: string;
  confirming: string;
  cancelOrder: string;
  cancelling: string;
  placeNewOrder: string;
  loadError: string;
  placeError: string;
  confirmError: string;
  cancelError: string;
  windowExpired: string;
};

const en: GuestVoucherCopy = {
  eyebrow: "Gift vouchers",
  title: "Give Seoul Prague",
  subtitle:
    "Purchase a gift voucher for friends or family. Pay by bank transfer or Czech banking QR — codes arrive by email after we confirm your payment (within 24 hours).",
  loading: "Loading…",
  unavailable: "Voucher sales are temporarily unavailable.",
  stepChoose: "1 · Choose amount",
  stepChooseHint: "Select a luxury gift voucher denomination.",
  stepQuantity: "2 · Quantity",
  quantityLabel: "Quantity",
  stepDetails: "3 · Your details",
  fullName: "Full name",
  fullNamePlaceholder: "Full name",
  email: "Email",
  emailPlaceholder: "you@email.com",
  phone: "Phone number",
  phonePlaceholder: "+420 …",
  stepPayment: "4 · Payment method",
  czechQrTitle: "Czech bank QR",
  czechQrHint: "Payment QR appears after you place the order",
  bankTransferTitle: "Bank transfer",
  bankTransferHint: "Transfer details appear after you place the order",
  termsTitle: "Voucher Terms & Conditions",
  termValidity: "Voucher is valid for 12 months from the issue date.",
  termCounter:
    "Vouchers are applied at the counter at payment. Please present the voucher code for staff to scan before paying your bill.",
  termNoCash: "In all cases, vouchers have no cash redemption value.",
  termContact:
    "For questions, please use Chat with us or contact the restaurant by email / phone.",
  placeOrder: "Place order",
  placingOrder: "Placing order…",
  detailsRequired: "Full name, email, and phone are required before placing an order.",
  bankNotConfigured: "Bank details are not configured yet. Please contact the restaurant.",
  completePayment: "Complete payment",
  paymentSubmitted: "Payment submitted",
  orderCancelled: "Order cancelled",
  cancelledBody:
    "The 15-minute payment window ended before you confirmed payment. This order was cancelled. You can place a new voucher order anytime.",
  paidBodyBefore: "Thank you. We will verify your transfer and email voucher codes to",
  paidBodyAfter: "within 24 hours.",
  payNowBodyBefore: "Pay now using the details below, then tap",
  payNowBodyStrong: "I’ve paid",
  payNowBodyAfter: "before the timer ends. Unpaid orders are cancelled automatically after 15 minutes.",
  timeLeft: "Time left to pay",
  orderId: "Order ID",
  voucher: "Voucher",
  total: "Total",
  accountHolder: "Account holder",
  account: "Account",
  iban: "IBAN",
  bank: "Bank",
  message: "Message",
  scanQrHint: "Scan with your Czech banking app",
  saveQr: "Save QR",
  ivePaid: "I’ve paid",
  confirming: "Confirming…",
  cancelOrder: "Cancel order",
  cancelling: "Cancelling…",
  placeNewOrder: "Place a new order",
  loadError: "Could not load voucher settings.",
  placeError: "Could not place order.",
  confirmError: "Could not confirm payment.",
  cancelError: "Could not cancel order.",
  windowExpired: "Payment window expired.",
};

const cs: GuestVoucherCopy = {
  ...en,
  eyebrow: "Dárkové vouchery",
  title: "Darujte Seoul Prague",
  subtitle:
    "Kupte dárkový voucher pro přátele nebo rodinu. Zaplaťte převodem nebo českým bankovním QR — kódy pošleme e-mailem po ověření platby (do 24 hodin).",
  loading: "Načítání…",
  unavailable: "Prodej voucherů je dočasně nedostupný.",
  stepChoose: "1 · Zvolte částku",
  stepChooseHint: "Vyberte hodnotu luxusního dárkového voucheru.",
  stepQuantity: "2 · Množství",
  quantityLabel: "Množství",
  stepDetails: "3 · Vaše údaje",
  fullName: "Celé jméno",
  fullNamePlaceholder: "Celé jméno",
  email: "E-mail",
  phone: "Telefon",
  stepPayment: "4 · Způsob platby",
  czechQrTitle: "České bankovní QR",
  czechQrHint: "Platební QR se zobrazí až po odeslání objednávky",
  bankTransferTitle: "Bankovní převod",
  bankTransferHint: "Údaje k převodu se zobrazí až po odeslání objednávky",
  termsTitle: "Obchodní podmínky voucheru",
  termValidity: "Voucher je platný 12 měsíců od data vystavení.",
  termCounter:
    "Voucher se uplatní u pokladny při platbě. Předložte prosím kód personálu ke naskenování před zaplacením účtu.",
  termNoCash: "Voucher nelze v žádném případě směnit za hotovost.",
  termContact:
    "S dotazy použijte Chat with us nebo kontaktujte restauraci e-mailem / telefonem.",
  placeOrder: "Objednat",
  placingOrder: "Odesílám…",
  detailsRequired: "Před objednávkou vyplňte jméno, e-mail a telefon.",
  bankNotConfigured: "Bankovní údaje zatím nejsou nastavené. Kontaktujte restauraci.",
  completePayment: "Dokončete platbu",
  paymentSubmitted: "Platba odeslána",
  orderCancelled: "Objednávka zrušena",
  cancelledBody:
    "15minutové okno pro platbu vypršelo dříve, než jste potvrdili platbu. Objednávka byla zrušena. Můžete vytvořit novou kdykoli.",
  paidBodyBefore: "Děkujeme. Ověříme převod a pošleme kódy voucherů na",
  paidBodyAfter: "do 24 hodin.",
  payNowBodyBefore: "Zaplaťte podle údajů níže a klepněte na",
  payNowBodyStrong: "Zaplatil(a) jsem",
  payNowBodyAfter: "před koncem odpočtu. Nezaplacené objednávky se po 15 minutách automaticky zruší.",
  timeLeft: "Zbývající čas",
  orderId: "Číslo objednávky",
  voucher: "Voucher",
  total: "Celkem",
  accountHolder: "Majitel účtu",
  account: "Účet",
  bank: "Banka",
  message: "Zpráva",
  scanQrHint: "Naskenujte v české bankovní aplikaci",
  saveQr: "Uložit QR",
  ivePaid: "Zaplatil(a) jsem",
  confirming: "Potvrzuji…",
  cancelOrder: "Zrušit objednávku",
  cancelling: "Ruším…",
  placeNewOrder: "Nová objednávka",
  loadError: "Nepodařilo se načíst nastavení voucherů.",
  placeError: "Objednávku se nepodařilo vytvořit.",
  confirmError: "Platbu se nepodařilo potvrdit.",
  cancelError: "Objednávku se nepodařilo zrušit.",
  windowExpired: "Platební okno vypršelo.",
};

const vi: GuestVoucherCopy = {
  ...en,
  eyebrow: "Voucher quà tặng",
  title: "Tặng Seoul Prague",
  subtitle:
    "Mua voucher quà tặng cho bạn bè hoặc gia đình. Thanh toán chuyển khoản hoặc QR ngân hàng Séc — mã gửi email sau khi chúng tôi xác nhận (trong 24 giờ).",
  loading: "Đang tải…",
  unavailable: "Tạm thời không bán voucher.",
  stepChoose: "1 · Chọn mệnh giá",
  stepChooseHint: "Chọn mệnh giá voucher cao cấp.",
  stepQuantity: "2 · Số lượng",
  quantityLabel: "Số lượng",
  stepDetails: "3 · Thông tin của bạn",
  fullName: "Họ và tên",
  fullNamePlaceholder: "Họ và tên",
  email: "Email",
  phone: "Số điện thoại",
  stepPayment: "4 · Phương thức thanh toán",
  czechQrTitle: "QR ngân hàng Séc",
  czechQrHint: "QR thanh toán hiện sau khi Place Order",
  bankTransferTitle: "Chuyển khoản",
  bankTransferHint: "Thông tin chuyển khoản hiện sau khi Place Order",
  termsTitle: "Điều khoản & điều kiện Voucher",
  termValidity: "Voucher có giá trị sử dụng trong vòng 12 tháng kể từ ngày cấp.",
  termCounter:
    "Voucher được áp dụng tại quầy khi thanh toán. Vui lòng đưa mã voucher cho nhân viên quét trước khi thanh toán đơn hàng.",
  termNoCash: "Trong mọi trường hợp, voucher không có giá trị quy đổi thành tiền mặt.",
  termContact:
    "Mọi thắc mắc vui lòng sử dụng Chat with us hoặc liên hệ nhà hàng qua email / số điện thoại.",
  placeOrder: "Đặt hàng",
  placingOrder: "Đang đặt…",
  detailsRequired: "Bắt buộc nhập họ tên, email và số điện thoại trước khi đặt hàng.",
  bankNotConfigured: "Chưa cấu hình thông tin ngân hàng. Vui lòng liên hệ nhà hàng.",
  completePayment: "Hoàn tất thanh toán",
  paymentSubmitted: "Đã gửi thanh toán",
  orderCancelled: "Đã hủy đơn",
  cancelledBody:
    "Cửa sổ thanh toán 15 phút đã hết trước khi bạn xác nhận. Đơn đã bị hủy. Bạn có thể đặt đơn mới bất cứ lúc nào.",
  paidBodyBefore: "Cảm ơn bạn. Chúng tôi sẽ xác minh và gửi mã voucher tới",
  paidBodyAfter: "trong vòng 24 giờ.",
  payNowBodyBefore: "Thanh toán theo thông tin bên dưới, rồi nhấn",
  payNowBodyStrong: "Tôi đã thanh toán",
  payNowBodyAfter: "trước khi hết giờ. Đơn chưa thanh toán sẽ tự hủy sau 15 phút.",
  timeLeft: "Thời gian còn lại",
  orderId: "Mã đơn",
  voucher: "Voucher",
  total: "Tổng",
  accountHolder: "Chủ tài khoản",
  account: "Tài khoản",
  bank: "Ngân hàng",
  message: "Nội dung",
  scanQrHint: "Quét bằng app ngân hàng Séc",
  saveQr: "Lưu QR",
  ivePaid: "Tôi đã thanh toán",
  confirming: "Đang xác nhận…",
  cancelOrder: "Hủy đơn",
  cancelling: "Đang hủy…",
  placeNewOrder: "Đặt đơn mới",
  loadError: "Không tải được cài đặt voucher.",
  placeError: "Không tạo được đơn.",
  confirmError: "Không xác nhận được thanh toán.",
  cancelError: "Không hủy được đơn.",
  windowExpired: "Hết thời gian thanh toán.",
};

const de: GuestVoucherCopy = {
  ...en,
  eyebrow: "Geschenkgutscheine",
  title: "Schenken Sie Seoul Prague",
  subtitle:
    "Kaufen Sie einen Geschenkgutschein für Freunde oder Familie. Zahlen Sie per Überweisung oder tschechischem Banking-QR — Codes per E-Mail nach Bestätigung (innerhalb von 24 Stunden).",
  loading: "Laden…",
  unavailable: "Gutscheinverkauf ist vorübergehend nicht verfügbar.",
  stepChoose: "1 · Betrag wählen",
  stepChooseHint: "Wählen Sie einen Luxus-Gutscheinwert.",
  stepQuantity: "2 · Menge",
  quantityLabel: "Menge",
  stepDetails: "3 · Ihre Daten",
  fullName: "Vollständiger Name",
  fullNamePlaceholder: "Vollständiger Name",
  email: "E-Mail",
  phone: "Telefonnummer",
  stepPayment: "4 · Zahlungsart",
  czechQrTitle: "Tschechischer Bank-QR",
  czechQrHint: "Zahlungs-QR erscheint nach dem Absenden der Bestellung",
  bankTransferTitle: "Banküberweisung",
  bankTransferHint: "Überweisungsdaten erscheinen nach dem Absenden",
  termsTitle: "Gutschein-AGB",
  termValidity: "Der Gutschein ist 12 Monate ab Ausstellungsdatum gültig.",
  termCounter:
    "Gutscheine werden an der Kasse eingelöst. Bitte zeigen Sie den Code dem Personal zum Scannen vor der Zahlung.",
  termNoCash: "Gutscheine sind in keinem Fall bar auszahlbar.",
  termContact:
    "Bei Fragen nutzen Sie Chat with us oder kontaktieren Sie das Restaurant per E-Mail / Telefon.",
  placeOrder: "Bestellen",
  placingOrder: "Wird bestellt…",
  detailsRequired: "Name, E-Mail und Telefon sind vor der Bestellung erforderlich.",
  bankNotConfigured: "Bankdaten sind noch nicht konfiguriert. Bitte kontaktieren Sie das Restaurant.",
  completePayment: "Zahlung abschließen",
  paymentSubmitted: "Zahlung übermittelt",
  orderCancelled: "Bestellung storniert",
  cancelledBody:
    "Das 15-Minuten-Zahlungsfenster endete, bevor Sie bestätigt haben. Die Bestellung wurde storniert. Sie können jederzeit neu bestellen.",
  paidBodyBefore: "Danke. Wir prüfen die Überweisung und senden Gutscheincodes an",
  paidBodyAfter: "innerhalb von 24 Stunden.",
  payNowBodyBefore: "Zahlen Sie mit den Angaben unten und tippen Sie auf",
  payNowBodyStrong: "Ich habe bezahlt",
  payNowBodyAfter: "bevor der Timer endet. Unbezahlte Bestellungen werden nach 15 Minuten automatisch storniert.",
  timeLeft: "Verbleibende Zeit",
  orderId: "Bestell-ID",
  voucher: "Gutschein",
  total: "Summe",
  accountHolder: "Kontoinhaber",
  account: "Konto",
  bank: "Bank",
  message: "Verwendungszweck",
  scanQrHint: "Mit Ihrer tschechischen Banking-App scannen",
  saveQr: "QR speichern",
  ivePaid: "Ich habe bezahlt",
  confirming: "Bestätigen…",
  cancelOrder: "Bestellung stornieren",
  cancelling: "Wird storniert…",
  placeNewOrder: "Neue Bestellung",
  loadError: "Gutscheineinstellungen konnten nicht geladen werden.",
  placeError: "Bestellung konnte nicht erstellt werden.",
  confirmError: "Zahlung konnte nicht bestätigt werden.",
  cancelError: "Bestellung konnte nicht storniert werden.",
  windowExpired: "Zahlungsfenster abgelaufen.",
};

const ko: GuestVoucherCopy = {
  ...en,
  eyebrow: "기프트 바우처",
  title: "Seoul Prague를 선물하세요",
  subtitle:
    "친구나 가족을 위한 기프트 바우처를 구매하세요. 계좌이체 또는 체코 은행 QR로 결제 — 확인 후 24시간 내 이메일로 코드가 발송됩니다.",
  loading: "불러오는 중…",
  unavailable: "바우처 판매가 일시적으로 중단되었습니다.",
  stepChoose: "1 · 금액 선택",
  stepChooseHint: "럭셔리 기프트 바우처 금액을 선택하세요.",
  stepQuantity: "2 · 수량",
  quantityLabel: "수량",
  stepDetails: "3 · 고객 정보",
  fullName: "성명",
  fullNamePlaceholder: "성명",
  email: "이메일",
  phone: "전화번호",
  stepPayment: "4 · 결제 방법",
  czechQrTitle: "체코 은행 QR",
  czechQrHint: "주문 후 결제 QR이 표시됩니다",
  bankTransferTitle: "계좌이체",
  bankTransferHint: "주문 후 이체 정보가 표시됩니다",
  termsTitle: "바우처 이용 약관",
  termValidity: "바우처는 발급일로부터 12개월간 유효합니다.",
  termCounter:
    "바우처는 결제 시 카운터에서 적용됩니다. 계산 전 직원에게 코드를 제시해 스캔해 주세요.",
  termNoCash: "어떠한 경우에도 바우처는 현금으로 환전할 수 없습니다.",
  termContact:
    "문의는 Chat with us를 이용하거나 이메일/전화로 연락해 주세요.",
  placeOrder: "주문하기",
  placingOrder: "주문 중…",
  detailsRequired: "주문 전 성명, 이메일, 전화번호가 필요합니다.",
  bankNotConfigured: "은행 정보가 아직 설정되지 않았습니다. 식당에 문의해 주세요.",
  completePayment: "결제 완료",
  paymentSubmitted: "결제 제출됨",
  orderCancelled: "주문 취소됨",
  cancelledBody:
    "결제를 확인하기 전에 15분 결제 시간이 종료되어 주문이 취소되었습니다. 언제든지 새로 주문할 수 있습니다.",
  paidBodyBefore: "감사합니다. 이체를 확인한 후 바우처 코드를",
  paidBodyAfter: "로 24시간 내에 보내드립니다.",
  payNowBodyBefore: "아래 정보로 결제한 뒤",
  payNowBodyStrong: "결제 완료",
  payNowBodyAfter: "를 타이머가 끝나기 전에 눌러 주세요. 미결제 주문은 15분 후 자동 취소됩니다.",
  timeLeft: "남은 시간",
  orderId: "주문 ID",
  voucher: "바우처",
  total: "합계",
  accountHolder: "예금주",
  account: "계좌",
  bank: "은행",
  message: "메모",
  scanQrHint: "체코 은행 앱으로 스캔",
  saveQr: "QR 저장",
  ivePaid: "결제 완료",
  confirming: "확인 중…",
  cancelOrder: "주문 취소",
  cancelling: "취소 중…",
  placeNewOrder: "새 주문",
  loadError: "바우처 설정을 불러올 수 없습니다.",
  placeError: "주문을 생성할 수 없습니다.",
  confirmError: "결제를 확인할 수 없습니다.",
  cancelError: "주문을 취소할 수 없습니다.",
  windowExpired: "결제 시간이 만료되었습니다.",
};

const GUEST_VOUCHER_COPY: Record<GuestReservationLang, GuestVoucherCopy> = {
  en,
  cs,
  vi,
  de,
  ko,
};

export function guestVoucherCopy(lang: GuestReservationLang): GuestVoucherCopy {
  return GUEST_VOUCHER_COPY[lang] ?? GUEST_VOUCHER_COPY.en;
}
