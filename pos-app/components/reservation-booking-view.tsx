"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Mail, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/modal";
import {
  buildTimeSlotsForDate,
  filterPastTimeSlots,
  filterSlotsByCapacity,
  formatOperatingHoursSummary,
  todayIsoDate,
  type SlotCapacityRow,
} from "@/lib/reservation-slots";
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

export function ReservationBookingView() {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [reservationsForDate, setReservationsForDate] = useState<SlotCapacityRow[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+420 ");
  const [guestCount, setGuestCount] = useState(2);
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("18:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successBookingCode, setSuccessBookingCode] = useState<string | null>(null);
  const [successManageUrl, setSuccessManageUrl] = useState<string | null>(null);
  const [successEmailSent, setSuccessEmailSent] = useState(false);

  const minDate = useMemo(() => todayIsoDate(), []);

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
    void fetchReservationsForDate(date).then(({ data, error }) => {
      if (error || !data) {
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
    setPhone("+420 ");
    setGuestCount(2);
    setDate(todayIsoDate());
    setTime("18:00");
    setNotes("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!guestName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email — we send confirmation and a manage link there.");
      return;
    }
    if (!phone.trim() || phone.trim() === "+420") {
      setError("Please enter your phone number.");
      return;
    }
    if (!date || !time) {
      setError("Please select a date and time.");
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
        setError(payload.error || "Failed to submit reservation.");
        return;
      }

      setSuccessBookingCode(payload.reservation.bookingCode);
      setSuccessManageUrl(payload.reservation.manageUrl);
      setSuccessEmailSent(payload.reservation.emailSent);
      resetForm();
      setShowSuccess(true);
    } catch {
      setError("Failed to submit reservation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:py-10 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
            <div className="mb-4 inline-flex rounded-full bg-red-600/20 p-3 text-red-400">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold leading-tight text-white">{RESTAURANT_NAME}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Wanna try some authentic Korean vibes?
              <br />
              Book your table now!
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-white">Location</p>
                <p className="mt-1 text-sm text-zinc-300">{ADDRESS}</p>
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-red-400 hover:text-red-300"
                >
                  Get Directions →
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <p className="text-sm font-semibold text-white">Contact</p>
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
                <p className="text-sm font-semibold text-white">Opening Hours</p>
                <p className="mt-1 text-sm text-zinc-300 whitespace-pre-line">{openingHoursSummary}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Make a Reservation</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Reserve your table at SEOUL PRAGUE
            </p>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-5">
              <label className="block text-sm">
                <span className="font-medium text-zinc-200">
                  Your Name <span className="text-red-400">*</span>
                </span>
                <input
                  type="text"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none ring-red-500/0 transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                  placeholder="Full name"
                  required
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    Email Address <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    Phone Number <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    Number of Guests <span className="text-red-400">*</span>
                  </span>
                  <select
                    value={guestCount}
                    onChange={(event) => setGuestCount(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    required
                  >
                    {guestOptions.map((count) => (
                      <option key={count} value={count}>
                        {count} {count === 1 ? "guest" : "guests"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    Select Date <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={minDate}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-200">
                    Select Time <span className="text-red-400">*</span>
                  </span>
                  <select
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                    required
                  >
                    {availableTimeSlots.length === 0 ? (
                      <option value="">
                        {settingsLoading ? "Loading…" : "No times available"}
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
                <span className="font-medium text-zinc-200">Additional Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Dietary requirements, special requests…"
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
                />
              </label>

              {error && (
                <p className="rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || availableTimeSlots.length === 0}
                className="w-full rounded-xl bg-red-600 py-4 text-base font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Reservation →"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <Modal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Reservation Received"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Thank you! Your reservation request has been submitted. Our team will confirm your
            booking shortly.
          </p>
          {successBookingCode && (
            <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              Booking code: {successBookingCode}
            </p>
          )}
          {successEmailSent ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              We emailed you a confirmation request and a link to change or cancel anytime.
            </p>
          ) : successManageUrl ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Save this link to manage your booking:{" "}
              <a href={successManageUrl} className="font-medium text-red-600 underline">
                Manage reservation
              </a>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
