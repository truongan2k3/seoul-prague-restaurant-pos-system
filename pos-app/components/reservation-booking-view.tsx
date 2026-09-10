"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Globe, Mail, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/modal";
import {
  buildTimeSlotsForDate,
  filterPastTimeSlots,
  filterSlotsByCapacity,
  formatOperatingHoursSummary,
  todayIsoDate,
  type SlotCapacityRow,
} from "@/lib/reservation-slots";
import {
  GUEST_RESERVATION_LANGS,
  pickEventTypeLabel,
  pickLocalizedText,
  type GuestReservationLang,
} from "@/lib/reservation-guest-form";
import {
  GUEST_LANG_SESSION_KEY,
  detectGuestReservationLangFromNavigator,
  guestReservationCopy,
  parseGuestReservationLang,
  resolveInitialGuestReservationLang,
} from "@/lib/i18n/guest-reservation";
import type { AppSettings } from "@/lib/types";
import type { WebsiteContent } from "@/lib/website/types";
import { DEFAULT_APP_SETTINGS, fetchAppSettings } from "@/src/lib/settings-actions";
import { fetchReservationsForDate } from "@/src/lib/reservation-actions";

const GUEST_LANG_LABELS: Record<GuestReservationLang, string> = {
  en: "English",
  cs: "Čeština",
  vi: "Tiếng Việt",
  de: "Deutsch",
  ko: "한국어",
};

function RequiredMark({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-[#C9A88B]"> *</span>;
}

export function ReservationBookingView({ website }: { website?: WebsiteContent }) {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [reservationsForDate, setReservationsForDate] = useState<SlotCapacityRow[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [lang, setLang] = useState<GuestReservationLang>("en");
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("18:00");
  const [notes, setNotes] = useState("");
  const [eventType, setEventType] = useState("");
  const [wantsBbq, setWantsBbq] = useState<"yes" | "no" | "undecided" | null>(null);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [gdprError, setGdprError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successBookingCode, setSuccessBookingCode] = useState<string | null>(null);
  const [successManageUrl, setSuccessManageUrl] = useState<string | null>(null);
  const [successEmailSent, setSuccessEmailSent] = useState(false);

  const copy = guestReservationCopy(lang);
  const required = appSettings.reservationRequiredFields;
  const eventTypes = appSettings.reservationEventTypes;
  const guestTexts = appSettings.reservationGuestTexts;
  const showEventTypeField = eventTypes.length > 0;
  const venue = appSettings.reservationGuestVenue;
  const mapsQuery = website?.settings.address?.trim() || venue.address;
  const configuredMapsUrl = website?.settings.googleMapsUrl?.trim() ?? "";
  const mapsUrl =
    configuredMapsUrl && configuredMapsUrl !== "https://maps.google.com"
      ? configuredMapsUrl
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const phoneHref = `tel:${(website?.settings.phone?.trim() || venue.phone).replace(/[^\d+]/g, "")}`;
  const emailHref = `mailto:${website?.settings.email?.trim() || venue.email}`;

  const minDate = useMemo(() => todayIsoDate(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("reservation-guest-lang");
    } catch {
      /* ignore */
    }
    const stored = sessionStorage.getItem(GUEST_LANG_SESSION_KEY);
    const navigatorLangs =
      typeof navigator !== "undefined"
        ? [
            ...(Array.isArray(navigator.languages) ? navigator.languages : []),
            navigator.language,
          ].filter(Boolean)
        : [];
    setLang(resolveInitialGuestReservationLang(stored, navigatorLangs));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(GUEST_LANG_SESSION_KEY, lang);
  }, [lang]);

  useEffect(() => {
    void fetchAppSettings().then(({ data }) => {
      setAppSettings(data);
      setSettingsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (guestCount > appSettings.reservationMaxGuestsPerSlot) {
      setGuestCount(appSettings.reservationMaxGuestsPerSlot);
    }
  }, [appSettings.reservationMaxGuestsPerSlot, guestCount]);

  useEffect(() => {
    void fetchReservationsForDate(date).then(({ data, error: fetchError }) => {
      if (fetchError || !data) {
        setReservationsForDate([]);
        return;
      }
      setReservationsForDate(
        data.map((row) => ({
          partySize: row.party_size,
          reservedAt: row.reserved_at,
          status: row.status,
        })),
      );
    });
  }, [date]);

  const guestOptions = useMemo(
    () =>
      Array.from({ length: appSettings.reservationMaxGuestsPerSlot }, (_, index) => index + 1),
    [appSettings.reservationMaxGuestsPerSlot],
  );

  const availableTimeSlots = useMemo(() => {
    const baseSlots = buildTimeSlotsForDate(
      date,
      appSettings.reservationOperatingHours,
      appSettings.reservationTimeStep,
    );
    const futureSlots = filterPastTimeSlots(baseSlots, date);
    return filterSlotsByCapacity(
      futureSlots,
      reservationsForDate,
      date,
      appSettings.reservationTimeStep,
      appSettings.reservationMaxGuestsPerSlot,
      guestCount,
    );
  }, [
    appSettings.reservationMaxGuestsPerSlot,
    appSettings.reservationOperatingHours,
    appSettings.reservationTimeStep,
    date,
    guestCount,
    reservationsForDate,
  ]);

  useEffect(() => {
    if (availableTimeSlots.length === 0) return;
    if (!availableTimeSlots.includes(time)) {
      setTime(availableTimeSlots[0]);
    }
  }, [availableTimeSlots, time]);

  const openingHoursSummary = useMemo(
    () => formatOperatingHoursSummary(appSettings.reservationOperatingHours),
    [appSettings.reservationOperatingHours],
  );

  const resetForm = () => {
    setGuestName("");
    setEmail("");
    setPhone("");
    setGuestCount(2);
    setDate(todayIsoDate());
    setTime("18:00");
    setNotes("");
    setEventType("");
    setWantsBbq(null);
    setGdprConsent(false);
    setGdprError(false);
  };

  const validateForm = (): string | null => {
    if (required.name && !guestName.trim()) return copy.errorName;
    if (required.email && !email.trim()) return copy.errorEmail;
    if (required.phone && !phone.trim()) return copy.errorPhone;
    if ((required.date || required.time) && (!date || !time)) return copy.errorDateTime;
    if (required.eventType && showEventTypeField && !eventType.trim()) return copy.errorEventType;
    if (!gdprConsent) {
      setGdprError(true);
      return copy.errorGdpr;
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setGdprError(false);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/reservations/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          guestCount,
          date,
          time,
          notes: (() => {
            const bbqTag =
              wantsBbq === "yes"
                ? "[BBQ: Yes]"
                : wantsBbq === "no"
                  ? "[BBQ: No]"
                  : wantsBbq === "undecided"
                    ? "[BBQ: Undecided]"
                    : "";
            const userNotes = notes.trim();
            return [bbqTag, userNotes].filter(Boolean).join(" ") || undefined;
          })(),
          eventType: eventType.trim() || undefined,
          gdprConsent: true,
          lang,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reservation?: {
          bookingCode: string;
          manageUrl: string;
          emailSent: boolean;
        };
      };
      if (!response.ok || !payload.reservation) {
        setError(payload.error || copy.errorSubmit);
        return;
      }

      setSuccessBookingCode(payload.reservation.bookingCode);
      setSuccessManageUrl(payload.reservation.manageUrl);
      setSuccessEmailSent(payload.reservation.emailSent);
      resetForm();
      setShowSuccess(true);
    } catch {
      setError(copy.errorSubmitRetry);
    } finally {
      setSubmitting(false);
    }
  };

  const successTitle = pickLocalizedText(guestTexts.successTitle, lang);
  const successBody = pickLocalizedText(guestTexts.successBody, lang);
  const successEmailSentText = pickLocalizedText(guestTexts.successEmailSent, lang);
  const successManageLinkText = pickLocalizedText(guestTexts.successManageLink, lang);
  const emailHint = pickLocalizedText(guestTexts.emailHint, lang);
  const gdprText = pickLocalizedText(guestTexts.gdprConsent, lang);

  const restaurantName = website?.settings.restaurantName?.trim() || venue.restaurantName;
  const displayAddress = website?.settings.address?.trim() || venue.address;
  const displayPhone = website?.settings.phone?.trim() || venue.phone;
  const displayEmail = website?.settings.email?.trim() || venue.email;
  const logoUrl = website?.media.logo?.fileUrl;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Reservations</p>
          <h1 className="landing-serif mt-3 text-3xl text-white lg:text-5xl">{copy.makeReservation}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/55">{copy.reserveSubtitle}</p>
        </div>
        <label className="inline-flex items-center gap-2 border border-white/15 bg-[#121214] px-3 py-2 text-sm">
          <Globe className="h-4 w-4 text-[#C9A88B]" />
          <select
            value={lang}
            onChange={(event) => setLang(parseGuestReservationLang(event.target.value))}
            className="bg-transparent text-white outline-none"
            aria-label="Language"
          >
            {GUEST_RESERVATION_LANGS.map((code) => (
              <option key={code} value={code} className="bg-[#121214]">
                {GUEST_LANG_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          <div className="rounded-none border border-white/10 bg-[#121214]/90 p-6 shadow-xl">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="mb-4 h-14 w-14 object-contain" />
            ) : (
              <div className="mb-4 inline-flex bg-[#8B1E2D]/25 p-3 text-[#C9A88B]">
                <UtensilsCrossed className="h-6 w-6" />
              </div>
            )}
            <h2 className="landing-serif text-2xl leading-tight text-white">{restaurantName}</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-white/55">{copy.tagline}</p>
          </div>

          <div className="rounded-none border border-white/10 bg-[#121214]/90 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A88B]" />
              <div>
                <p className="text-sm font-semibold text-white">{copy.location}</p>
                <p className="mt-1 text-sm text-white/70">{displayAddress}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-[#C9A88B] hover:text-[#E8D5C4]"
                >
                  {copy.getDirections}
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-none border border-white/10 bg-[#121214]/90 p-5 shadow-xl">
            <p className="text-sm font-semibold text-white">{copy.contact}</p>
            <div className="mt-3 space-y-2 text-sm">
              <a href={phoneHref} className="flex items-center gap-2 text-white/70 hover:text-white">
                <Phone className="h-4 w-4 text-[#C9A88B]" />
                {displayPhone}
              </a>
              <a href={emailHref} className="flex items-center gap-2 text-white/70 hover:text-white">
                <Mail className="h-4 w-4 text-[#C9A88B]" />
                {displayEmail}
              </a>
            </div>
          </div>

          <div className="rounded-none border border-white/10 bg-[#121214]/90 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A88B]" />
              <div>
                <p className="text-sm font-semibold text-white">{copy.openingHours}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-white/70">{openingHoursSummary}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div className="rounded-none border border-white/10 bg-[#121214]/95 p-6 shadow-2xl sm:p-8">
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-5">
              <label className="block text-sm">
                <span className="font-medium text-white/90">
                  {copy.yourName}
                  <RequiredMark show={required.name} />
                </span>
                <input
                  type="text"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none ring-[#C9A88B]/0 transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                  placeholder={copy.namePlaceholder}
                  required={required.name}
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
                <label className="flex flex-col text-sm">
                  <span className="font-medium text-white/90">
                    {copy.emailAddress}
                    <RequiredMark show={required.email} />
                  </span>
                  <span className="mt-1 min-h-[1.25rem] text-xs text-white/45">
                    {emailHint || "\u00A0"}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    placeholder={copy.emailPlaceholder}
                    required={required.email}
                  />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="font-medium text-white/90">
                    {copy.phoneNumber}
                    <RequiredMark show={required.phone} />
                  </span>
                  <span className="mt-1 min-h-[1.25rem] text-xs text-white/45" aria-hidden>
                    {"\u00A0"}
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    placeholder="+420 123 456 789"
                    required={required.phone}
                  />
                </label>
              </div>

              {showEventTypeField ? (
                <label className="block text-sm">
                  <span className="font-medium text-white/90">
                    {copy.eventType}
                    <RequiredMark show={required.eventType} />
                  </span>
                  <select
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    required={required.eventType}
                  >
                    <option value="">{copy.selectEventType}</option>
                    {eventTypes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {pickEventTypeLabel(option, lang)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="rounded-none border border-white/15 bg-[#0B0B0C] p-4">
                <p className="text-sm font-medium text-white/90">{copy.bbqQuestion}</p>
                <p className="mt-1 text-xs text-white/45">{copy.bbqHint}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setWantsBbq("yes")}
                    className={`rounded-none py-3 text-sm font-semibold transition ${
                      wantsBbq === "yes"
                        ? "bg-[#8B1E2D] text-white"
                        : "border border-white/15 text-white/70 hover:bg-zinc-800"
                    }`}
                  >
                    🔥 {copy.bbqYes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWantsBbq("no")}
                    className={`rounded-none py-3 text-sm font-semibold transition ${
                      wantsBbq === "no"
                        ? "bg-zinc-700 text-white"
                        : "border border-white/15 text-white/70 hover:bg-zinc-800"
                    }`}
                  >
                    {copy.bbqNo}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWantsBbq("undecided")}
                    className={`rounded-none py-3 text-sm font-semibold transition ${
                      wantsBbq === "undecided"
                        ? "bg-amber-700 text-white"
                        : "border border-white/15 text-white/70 hover:bg-zinc-800"
                    }`}
                  >
                    {copy.bbqUndecided}
                  </button>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-white/90">
                    {copy.numberOfGuests}
                    <RequiredMark show={required.guestCount} />
                  </span>
                  <select
                    value={guestCount}
                    onChange={(event) => setGuestCount(Number(event.target.value))}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    required={required.guestCount}
                  >
                    {guestOptions.map((count) => (
                      <option key={count} value={count}>
                        {count}{" "}
                        {count === 1 ? copy.guestSingular : copy.guestPlural}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-white/90">
                    {copy.selectDate}
                    <RequiredMark show={required.date} />
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={minDate}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    required={required.date}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-white/90">
                    {copy.selectTime}
                    <RequiredMark show={required.time} />
                  </span>
                  <select
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                    required={required.time}
                  >
                    {availableTimeSlots.length === 0 ? (
                      <option value="">
                        {settingsLoading ? copy.loadingTimes : copy.noTimesAvailable}
                      </option>
                    ) : (
                      availableTimeSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="font-medium text-white/90">
                  {copy.additionalNotes}
                  <RequiredMark show={required.notes} />
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder={copy.notesPlaceholder}
                  className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
                  required={required.notes}
                />
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-none border px-4 py-3 text-sm transition ${
                  gdprError
                    ? "border-red-500 bg-red-950/40 ring-2 ring-red-500/40"
                    : "border-white/15 bg-[#0B0B0C]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={gdprConsent}
                  onChange={(event) => {
                    setGdprConsent(event.target.checked);
                    if (event.target.checked) setGdprError(false);
                  }}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600"
                />
                <span className="text-white/70">{gdprText}</span>
              </label>
              {gdprError ? (
                <p className="text-sm text-[#C9A88B]">{copy.gdprRequired}</p>
              ) : null}

              {error ? (
                <p className="rounded-none bg-red-950/60 px-4 py-3 text-sm text-[#E8D5C4]">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || availableTimeSlots.length === 0}
                className="w-full rounded-none bg-[#8B1E2D] py-4 text-base font-semibold text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? copy.submitting : copy.submitReservation}
              </button>
            </form>
          </div>
        </section>
      </div>

      <Modal open={showSuccess} onClose={() => setShowSuccess(false)} title={successTitle}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-none bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">{successBody}</p>
          {successBookingCode ? (
            <p className="rounded-none bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-white">
              {copy.bookingCode}: {successBookingCode}
            </p>
          ) : null}
          {successEmailSent ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{successEmailSentText}</p>
          ) : successManageUrl ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {successManageLinkText}{" "}
              <a href={successManageUrl} className="font-medium text-red-600 underline">
                {copy.manageReservation}
              </a>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="w-full rounded-none bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            {copy.close}
          </button>
        </div>
      </Modal>
    </div>
  );
}
