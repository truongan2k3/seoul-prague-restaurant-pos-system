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
  GUEST_LANG_STORAGE_KEY,
  guestReservationCopy,
  parseGuestReservationLang,
} from "@/lib/i18n/guest-reservation";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, fetchAppSettings } from "@/src/lib/settings-actions";
import { fetchReservationsForDate } from "@/src/lib/reservation-actions";

const RESTAURANT_NAME = "SEOUL PRAGUE Korean BBQ";
const ADDRESS = "Václavské nám. 819/43, 110 00 Praha";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`;
const PHONE = "+420 123 456 789";
const EMAIL = "info@seoulprague.cz";
const PHONE_HREF = "tel:+420123456789";
const EMAIL_HREF = "mailto:info@seoulprague.cz";

const GUEST_LANG_LABELS: Record<GuestReservationLang, string> = {
  en: "English",
  vi: "Tiếng Việt",
  de: "Deutsch",
  ko: "한국어",
};

function RequiredMark({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-red-400"> *</span>;
}

export function ReservationBookingView() {
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

  const minDate = useMemo(() => todayIsoDate(), []);

  useEffect(() => {
    const stored = parseGuestReservationLang(localStorage.getItem(GUEST_LANG_STORAGE_KEY));
    setLang(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem(GUEST_LANG_STORAGE_KEY, lang);
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
          notes: notes.trim() || undefined,
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:py-10 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
            <div className="mb-4 inline-flex rounded-full bg-red-600/20 p-3 text-red-400">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold leading-tight text-white">{RESTAURANT_NAME}</h1>
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{copy.tagline}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-white">{copy.location}</p>
                <p className="mt-1 text-sm text-zinc-300">{ADDRESS}</p>
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-red-400 hover:text-red-300"
                >
                  {copy.getDirections}
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <p className="text-sm font-semibold text-white">{copy.contact}</p>
            <div className="mt-3 space-y-2 text-sm">
              <a href={PHONE_HREF} className="flex items-center gap-2 text-zinc-300 hover:text-white">
                <Phone className="h-4 w-4 text-red-400" />
                {PHONE}
              </a>
              <a href={EMAIL_HREF} className="flex items-center gap-2 text-zinc-300 hover:text-white">
                <Mail className="h-4 w-4 text-red-400" />
                {EMAIL}
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-white">{copy.openingHours}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-300">{openingHoursSummary}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">{copy.makeReservation}</h2>
                <p className="mt-2 text-sm text-zinc-400">{copy.reserveSubtitle}</p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                <Globe className="h-4 w-4 text-red-400" />
                <select
                  value={lang}
                  onChange={(event) =>
                    setLang(parseGuestReservationLang(event.target.value))
                  }
                  className="bg-transparent text-white outline-none"
                >
                  {GUEST_RESERVATION_LANGS.map((code) => (
                    <option key={code} value={code} className="bg-zinc-900">
                      {GUEST_LANG_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-5">
              <label className="block text-sm">
                <span className="font-medium text-zinc-200">
                  {copy.yourName}
                  <RequiredMark show={required.name} />
                </span>
                <input
                  type="text"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none ring-red-500/0 transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                  placeholder={copy.namePlaceholder}
                  required={required.name}
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    {copy.emailAddress}
                    <RequiredMark show={required.email} />
                  </span>
                  {emailHint ? (
                    <span className="mt-1 block text-xs text-zinc-500">{emailHint}</span>
                  ) : null}
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    placeholder={copy.emailPlaceholder}
                    required={required.email}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    {copy.phoneNumber}
                    <RequiredMark show={required.phone} />
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    placeholder="+420 123 456 789"
                    required={required.phone}
                  />
                </label>
              </div>

              {showEventTypeField ? (
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    {copy.eventType}
                    <RequiredMark show={required.eventType} />
                  </span>
                  <select
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
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

              <div className="grid gap-5 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    {copy.numberOfGuests}
                    <RequiredMark show={required.guestCount} />
                  </span>
                  <select
                    value={guestCount}
                    onChange={(event) => setGuestCount(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
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
                  <span className="font-medium text-zinc-200">
                    {copy.selectDate}
                    <RequiredMark show={required.date} />
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={minDate}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    required={required.date}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    {copy.selectTime}
                    <RequiredMark show={required.time} />
                  </span>
                  <select
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
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
                <span className="font-medium text-zinc-200">
                  {copy.additionalNotes}
                  <RequiredMark show={required.notes} />
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder={copy.notesPlaceholder}
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                  required={required.notes}
                />
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  gdprError
                    ? "border-red-500 bg-red-950/40 ring-2 ring-red-500/40"
                    : "border-zinc-700 bg-zinc-950"
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
                <span className="text-zinc-300">{gdprText}</span>
              </label>
              {gdprError ? (
                <p className="text-sm text-red-400">{copy.gdprRequired}</p>
              ) : null}

              {error ? (
                <p className="rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || availableTimeSlots.length === 0}
                className="w-full rounded-xl bg-red-600 py-4 text-base font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? copy.submitting : copy.submitReservation}
              </button>
            </form>
          </div>
        </section>
      </div>

      <Modal open={showSuccess} onClose={() => setShowSuccess(false)} title={successTitle}>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">{successBody}</p>
          {successBookingCode ? (
            <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
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
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            {copy.close}
          </button>
        </div>
      </Modal>
    </div>
  );
}
