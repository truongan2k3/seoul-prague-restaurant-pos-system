"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Globe, Mail, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/modal";
import {
  buildTimeSlotsForDate,
  filterPastTimeSlots,
  formatOperatingHoursSummary,
  todayIsoDate,
} from "@/lib/reservation-slots";
import {
  GUEST_RESERVATION_LANGS,
  pickEventTypeLabel,
  pickLocalizedText,
  type GuestReservationLang,
} from "@/lib/reservation-guest-form";
import {
  GUEST_LANG_SESSION_KEY,
  guestReservationCopy,
  persistGuestReservationLang,
  resolveInitialGuestReservationLang,
} from "@/lib/i18n/guest-reservation";
import type { AppSettings } from "@/lib/types";
import { LandingImage } from "@/lib/website/landing-image";
import type { WebsiteContent } from "@/lib/website/types";
import { openGuestChat } from "@/lib/guest-chat-ui";
import {
  ONLINE_LARGE_PARTY_OPTION,
  ONLINE_SELF_SERVE_MAX_PARTY,
} from "@/lib/reservation-party-limits";
import { DEFAULT_APP_SETTINGS, fetchAppSettings } from "@/src/lib/settings-actions";

type SlotStatus = "available" | "limited" | "full";

type AvailabilitySlot = {
  time: string;
  status: SlotStatus;
};

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

function slotStatusLabel(
  status: SlotStatus,
  copy: ReturnType<typeof guestReservationCopy>,
): string {
  if (status === "limited") return copy.slotLimited;
  if (status === "full") return copy.slotFull;
  return copy.slotAvailable;
}

export function ReservationBookingView({
  website,
  embedded = false,
  emailOptional = false,
  onBooked,
}: {
  website?: WebsiteContent;
  /** Form-only layout for Client Screen panel. */
  embedded?: boolean;
  /** Force email optional (overrides admin required-fields for this form). */
  emailOptional?: boolean;
  /** When set (typically embedded), skip success modal and notify parent. */
  onBooked?: (info: { id: string; bookingCode: string }) => void;
}) {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
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
  const [holdToken, setHoldToken] = useState<string | null>(null);

  const copy = guestReservationCopy(lang);
  const required = {
    ...appSettings.reservationRequiredFields,
    email: emailOptional ? false : appSettings.reservationRequiredFields.email,
  };
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
    persistGuestReservationLang(lang);
  }, [lang]);

  useEffect(() => {
    void fetchAppSettings().then(({ data }) => {
      setAppSettings(data);
      setSettingsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (embedded) {
      if (guestCount > appSettings.reservationMaxGuestsPerSlot) {
        setGuestCount(appSettings.reservationMaxGuestsPerSlot);
      }
      return;
    }
    // Online: only 1–12 or the “12+” sentinel.
    if (guestCount !== ONLINE_LARGE_PARTY_OPTION && guestCount > ONLINE_SELF_SERVE_MAX_PARTY) {
      setGuestCount(ONLINE_SELF_SERVE_MAX_PARTY);
    }
  }, [appSettings.reservationMaxGuestsPerSlot, embedded, guestCount]);

  const requiresLargePartyContact = !embedded && guestCount === ONLINE_LARGE_PARTY_OPTION;

  // Release hold on unmount / abandon.
  useEffect(() => {
    return () => {
      if (!holdToken) return;
      void fetch("/api/reservations/hold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdToken }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [holdToken]);

  useEffect(() => {
    if (requiresLargePartyContact) {
      setAvailabilitySlots([]);
      setSlotsLoading(false);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    const params = new URLSearchParams({
      date,
      partySize: String(guestCount),
    });
    if (wantsBbq) params.set("grill", wantsBbq);

    void fetch(`/api/reservations/availability?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          slots?: AvailabilitySlot[];
        };
        if (cancelled) return;
        if (!response.ok || !payload.slots) {
          const base = filterPastTimeSlots(
            buildTimeSlotsForDate(
              date,
              appSettings.reservationOperatingHours,
              appSettings.reservationTimeStep,
            ),
            date,
          ).map((slot) => ({ time: slot, status: "available" as const }));
          setAvailabilitySlots(base);
          return;
        }
        setAvailabilitySlots(payload.slots);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailabilitySlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    appSettings.reservationOperatingHours,
    appSettings.reservationTimeStep,
    date,
    guestCount,
    wantsBbq,
    requiresLargePartyContact,
  ]);

  const guestOptions = useMemo(() => {
    if (embedded) {
      return Array.from(
        { length: appSettings.reservationMaxGuestsPerSlot },
        (_, index) => index + 1,
      );
    }
    return Array.from({ length: ONLINE_SELF_SERVE_MAX_PARTY }, (_, index) => index + 1);
  }, [appSettings.reservationMaxGuestsPerSlot, embedded]);

  /** Bookable slots for guests — Full is hidden (staff may still override in POS). */
  const availableTimeSlots = useMemo(
    () => availabilitySlots.filter((row) => row.status !== "full"),
    [availabilitySlots],
  );

  const selectedSlotStatus = useMemo(
    () => availabilitySlots.find((row) => row.time === time)?.status ?? null,
    [availabilitySlots, time],
  );

  useEffect(() => {
    if (availableTimeSlots.length === 0) return;
    if (!availableTimeSlots.some((row) => row.time === time)) {
      setTime(availableTimeSlots[0].time);
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
    setHoldToken(null);
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

    if (requiresLargePartyContact) {
      setError(copy.largePartyMessage);
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    let activeHold = holdToken;
    try {
      const holdResponse = await fetch("/api/reservations/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          partySize: guestCount,
          wantsGrill: wantsBbq,
        }),
      });
      const holdPayload = (await holdResponse.json().catch(() => ({}))) as {
        holdToken?: string;
        error?: string;
      };
      if (holdResponse.ok && holdPayload.holdToken) {
        activeHold = holdPayload.holdToken;
        setHoldToken(holdPayload.holdToken);
      }

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
          emailOptional: emailOptional || undefined,
          receptionDesk: embedded || undefined,
          holdToken: activeHold || undefined,
          wantsGrill: wantsBbq,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reservation?: {
          id?: string;
          bookingCode: string;
          manageUrl: string;
          emailSent: boolean;
        };
      };
      if (!response.ok || !payload.reservation) {
        setError(payload.error || copy.errorSubmit);
        return;
      }

      setHoldToken(null);
      resetForm();
      if (onBooked) {
        onBooked({
          id: payload.reservation.id ?? "",
          bookingCode: payload.reservation.bookingCode,
        });
        return;
      }

      setSuccessBookingCode(payload.reservation.bookingCode);
      setSuccessManageUrl(payload.reservation.manageUrl);
      setShowSuccess(true);
    } catch {
      setError(copy.errorSubmitRetry);
    } finally {
      setSubmitting(false);
    }
  };

  const successTitle = pickLocalizedText(guestTexts.successTitle, lang);
  const successBody = pickLocalizedText(guestTexts.successBody, lang);
  const successManageLinkText = pickLocalizedText(guestTexts.successManageLink, lang);
  const emailHint = pickLocalizedText(guestTexts.emailHint, lang);
  const gdprText = pickLocalizedText(guestTexts.gdprConsent, lang);

  const restaurantName = website?.settings.restaurantName?.trim() || venue.restaurantName;
  const displayAddress = website?.settings.address?.trim() || venue.address;
  const displayPhone = website?.settings.phone?.trim() || venue.phone;
  const displayEmail = website?.settings.email?.trim() || venue.email;
  const logoUrl = website?.media.logo?.fileUrl;

  return (
    <div className={embedded ? "w-full" : "mx-auto max-w-6xl px-4 pb-16"}>
      {embedded ? null : (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Reservations</p>
            <h1 className="landing-serif mt-3 text-3xl text-white lg:text-5xl">{copy.makeReservation}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/55">{copy.reserveSubtitle}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <Globe className="h-4 w-4 text-[#C9A88B]" />
            <span className="sr-only">{copy.languageLabel}</span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as GuestReservationLang)}
              className="rounded-none border border-white/15 bg-[#0B0B0C] px-3 py-2 text-white outline-none"
            >
              {GUEST_RESERVATION_LANGS.map((code) => (
                <option key={code} value={code}>
                  {GUEST_LANG_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {embedded ? null : (
        <div className="mb-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 text-sm text-white/70">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A88B]" />
              <div>
                <p className="font-medium text-white">{copy.location}</p>
                <p>{displayAddress}</p>
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[#C9A88B] hover:underline">
                  {copy.getDirections}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A88B]" />
              <div>
                <p className="font-medium text-white">{copy.contact}</p>
                <a href={phoneHref} className="hover:text-[#C9A88B]">
                  {displayPhone}
                </a>
                <br />
                <a href={emailHref} className="hover:text-[#C9A88B]">
                  {displayEmail}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A88B]" />
              <div>
                <p className="font-medium text-white">{copy.openingHours}</p>
                <p className="whitespace-pre-line">{openingHoursSummary}</p>
              </div>
            </div>
          </div>
          {logoUrl ? (
            <div className="relative hidden min-h-[160px] overflow-hidden lg:block">
              <LandingImage src={logoUrl} alt={restaurantName} className="object-contain opacity-80" fill sizes="(max-width: 1024px) 0px, 40vw" />
            </div>
          ) : null}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-none border border-white/10 bg-[#111113]/80 p-5 backdrop-blur sm:p-8">
        {embedded ? (
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <UtensilsCrossed className="h-4 w-4 text-[#C9A88B]" />
              <span className="text-sm font-semibold tracking-wide">{copy.makeReservation}</span>
            </div>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as GuestReservationLang)}
              className="rounded-none border border-white/15 bg-[#0B0B0C] px-2 py-1 text-xs text-white outline-none"
            >
              {GUEST_RESERVATION_LANGS.map((code) => (
                <option key={code} value={code}>
                  {GUEST_LANG_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-white/80">
            {copy.yourName}
            <RequiredMark show={required.name} />
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none ring-[#C9A88B]/0 transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
              placeholder={copy.namePlaceholder}
              autoComplete="name"
            />
          </label>
          <label className="block text-sm text-white/80">
            {copy.numberOfGuests}
            <RequiredMark show />
            <select
              value={guestCount}
              onChange={(event) => setGuestCount(Number(event.target.value))}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
            >
              {guestOptions.map((count) => (
                <option key={count} value={count}>
                  {count} {count === 1 ? copy.guestSingular : copy.guestPlural}
                </option>
              ))}
              {!embedded ? (
                <option value={ONLINE_LARGE_PARTY_OPTION}>{copy.largePartyOption}</option>
              ) : null}
            </select>
          </label>
        </div>

        {requiresLargePartyContact ? (
          <div className="space-y-4 rounded-none border border-[#C9A88B]/35 bg-[#C9A88B]/10 px-4 py-5 text-sm text-[#F5EDE4]">
            <p className="landing-serif text-lg text-[#C9A88B]">{copy.largePartyTitle}</p>
            <p className="leading-relaxed text-white/80">{copy.largePartyMessage}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openGuestChat()}
                className="rounded-none border border-[#C9A88B]/50 bg-[#0B0B0C] px-4 py-2.5 text-sm font-medium text-[#C9A88B] transition hover:border-[#C9A88B] hover:bg-[#141416]"
              >
                {copy.largePartyChatCta}
              </button>
              <a
                href={emailHref}
                className="inline-flex items-center gap-2 rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-2.5 text-sm text-white/80 transition hover:border-white/30"
              >
                <Mail className="h-4 w-4 text-[#C9A88B]" />
                {displayEmail}
              </a>
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-2.5 text-sm text-white/80 transition hover:border-white/30"
              >
                <Phone className="h-4 w-4 text-[#C9A88B]" />
                {displayPhone}
              </a>
            </div>
          </div>
        ) : null}

        {requiresLargePartyContact ? null : (
        <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-white/80">
            {copy.emailAddress}
            <RequiredMark show={required.email} />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
              placeholder={copy.emailPlaceholder}
              autoComplete="email"
            />
            {emailHint ? <p className="mt-1 text-xs text-white/40">{emailHint}</p> : null}
          </label>
          <label className="block text-sm text-white/80">
            {copy.phoneNumber}
            <RequiredMark show={required.phone} />
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
              placeholder="+420 123 456 789"
              autoComplete="tel"
            />
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-white/90">{copy.bbqQuestion}</p>
          <p className="text-xs text-white/45">{copy.bbqHint}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "yes" as const, label: `🔥 ${copy.bbqYes}` },
                { value: "no" as const, label: copy.bbqNo },
                { value: "undecided" as const, label: copy.bbqUndecided },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWantsBbq(option.value)}
                className={`rounded-none border px-3 py-2 text-sm transition ${
                  wantsBbq === option.value
                    ? "border-[#C9A88B] bg-[#C9A88B]/15 text-[#C9A88B]"
                    : "border-white/15 bg-[#0B0B0C] text-white/70 hover:border-white/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {showEventTypeField ? (
          <label className="block text-sm text-white/80">
            {copy.eventType}
            <RequiredMark show={required.eventType} />
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-white/80">
            {copy.selectDate}
            <RequiredMark show={required.date} />
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
            />
          </label>
          <label className="block text-sm text-white/80">
            {copy.selectTime}
            <RequiredMark show={required.time} />
            <select
              value={time}
              onChange={(event) => setTime(event.target.value)}
              disabled={settingsLoading || slotsLoading}
              className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30 disabled:opacity-60"
            >
              {settingsLoading || slotsLoading ? (
                <option value={time}>{copy.loadingTimes}</option>
              ) : availableTimeSlots.length === 0 ? (
                <option value="">{copy.noTimesAvailable}</option>
              ) : (
                availableTimeSlots.map((slot) => (
                  <option key={slot.time} value={slot.time}>
                    {slot.time} — {slotStatusLabel(slot.status, copy)}
                  </option>
                ))
              )}
            </select>
            {selectedSlotStatus === "limited" ? (
              <p className="mt-1 text-xs text-amber-300/90">{copy.slotLimited}</p>
            ) : null}
          </label>
        </div>

        <label className="block text-sm text-white/80">
          {copy.additionalNotes}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder={copy.notesPlaceholder}
            className="mt-2 w-full rounded-none border border-white/15 bg-[#0B0B0C] px-4 py-3 text-white outline-none transition focus:border-[#C9A88B] focus:ring-2 focus:ring-[#C9A88B]/30"
          />
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-none border px-3 py-3 text-sm ${
            gdprError ? "border-red-500/60 bg-red-950/20 text-red-200" : "border-white/10 text-white/70"
          }`}
        >
          <input
            type="checkbox"
            checked={gdprConsent}
            onChange={(event) => {
              setGdprConsent(event.target.checked);
              if (event.target.checked) setGdprError(false);
            }}
            className="mt-1"
          />
          <span>{gdprText || copy.gdprRequired}</span>
        </label>

        {error ? (
          <p className="rounded-none border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || availableTimeSlots.length === 0}
          className="w-full rounded-none bg-[#8B1E2D] py-4 text-base font-semibold text-white transition hover:bg-[#A02435] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? copy.submitting : copy.submitReservation}
        </button>
        </>
        )}
      </form>

      <Modal open={showSuccess} onClose={() => setShowSuccess(false)} title={successTitle || copy.makeReservation}>
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          <p>{successBody}</p>
          {successBookingCode ? (
            <p className="font-semibold">
              {copy.bookingCode}: {successBookingCode}
            </p>
          ) : null}
          <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{copy.emailAfterConfirmNote}</span>
          </p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
            {copy.spamFolderReminder}
          </p>
          {successManageUrl ? (
            <a
              href={successManageUrl}
              className="inline-flex text-[#8B1E2D] underline dark:text-[#C9A88B]"
            >
              {successManageLinkText || copy.manageReservation}
            </a>
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
