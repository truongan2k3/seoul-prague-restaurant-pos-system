-- Guest reservation form configuration + event type on bookings
-- Run in Supabase SQL editor (safe to re-run)

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_required_fields jsonb DEFAULT '{
    "name": true,
    "email": true,
    "phone": true,
    "guestCount": true,
    "date": true,
    "time": true,
    "notes": false,
    "eventType": false
  }'::jsonb;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_event_types jsonb DEFAULT '[
    {"id": "casual", "labels": {"en": "Casual dining", "vi": "Ăn uống thông thường", "de": "Lockeres Essen", "ko": "일반 식사"}},
    {"id": "birthday", "labels": {"en": "Birthday", "vi": "Sinh nhật", "de": "Geburtstag", "ko": "생일"}},
    {"id": "anniversary", "labels": {"en": "Anniversary", "vi": "Kỷ niệm", "de": "Jubiläum", "ko": "기념일"}},
    {"id": "meeting", "labels": {"en": "Meeting", "vi": "Họp mặt", "de": "Meeting", "ko": "모임"}}
  ]'::jsonb;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reservation_guest_texts jsonb DEFAULT '{
    "emailHint": {
      "en": "Enter your email so we can send a confirmation.",
      "vi": "Nhập email để chúng tôi gửi mail xác nhận.",
      "de": "Geben Sie Ihre E-Mail ein, damit wir eine Bestätigung senden können.",
      "ko": "확인 메일을 받으실 이메일을 입력해 주세요."
    },
    "successTitle": {
      "en": "Reservation Received",
      "vi": "Đã nhận đặt bàn",
      "de": "Reservierung erhalten",
      "ko": "예약 접수 완료"
    },
    "successBody": {
      "en": "Thank you! Your reservation request has been submitted. Our team will confirm your booking shortly.",
      "vi": "Cảm ơn bạn! Yêu cầu đặt bàn đã được gửi. Nhân viên sẽ xác nhận sớm.",
      "de": "Vielen Dank! Ihre Reservierungsanfrage wurde übermittelt. Unser Team bestätigt Ihre Buchung in Kürze.",
      "ko": "감사합니다! 예약 요청이 접수되었습니다. 곧 예약을 확인해 드리겠습니다."
    },
    "successEmailSent": {
      "en": "We emailed you a confirmation request and a link to change or cancel anytime.",
      "vi": "Chúng tôi đã gửi email xác nhận và liên kết để bạn có thể đổi hoặc hủy bất cứ lúc nào.",
      "de": "Wir haben Ihnen eine Bestätigungs-E-Mail mit Link zum Ändern oder Stornieren gesendet.",
      "ko": "확인 메일과 예약 변경·취소 링크를 보내 드렸습니다."
    },
    "successManageLink": {
      "en": "Save this link to manage your booking:",
      "vi": "Lưu liên kết này để quản lý đặt bàn:",
      "de": "Speichern Sie diesen Link zur Verwaltung Ihrer Buchung:",
      "ko": "예약 관리를 위해 이 링크를 저장해 주세요:"
    },
    "gdprConsent": {
      "en": "By submitting this reservation, I agree that the restaurant may process the personal data I provide to prepare and manage my table booking.",
      "vi": "Bằng việc gửi đặt bàn, tôi đồng ý cho nhà hàng xử lý dữ liệu cá nhân tôi cung cấp nhằm chuẩn bị và quản lý bàn đặt.",
      "de": "Mit dem Absenden stimme ich zu, dass das Restaurant meine personenbezogenen Daten zur Vorbereitung und Verwaltung meiner Reservierung verarbeiten darf.",
      "ko": "예약을 제출함으로써, 제공한 개인정보를 예약 준비 및 관리 목적으로 처리하는 것에 동의합니다."
    }
  }'::jsonb;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS event_type text;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS gdpr_consent_at timestamptz;
