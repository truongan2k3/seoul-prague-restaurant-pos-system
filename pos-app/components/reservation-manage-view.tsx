"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Loader2, UtensilsCrossed } from "lucide-react";
import {
  buildTimeSlotsForDate,
  filterPastTimeSlots,
  filterSlotsByCapacity,
  todayIsoDate,
  type SlotCapacityRow,
} from "@/lib/reservation-slots";
import type { AppSettings, ReservationStatus } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, fetchAppSettings } from "@/src/lib/settings-actions";
import { fetchReservationsForDate } from "@/src/lib/reservation-actions";

interface ManagedReservation {
  bookingCode: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  reservedAt: string;
  status: ReservationStatus;
  notes: string | null;
  manageUrl: string;
}

const MANAGEABLE: ReservationStatus[] = ["pending", "confirmed", "late"];

function splitReservedAt(iso: string): { date: string; time: string } {
  const local = new Date(iso);
  const date = [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, "0"),
    String(local.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(local.getHours()).padStart(2, "0"),
    String(local.getMinutes()).padStart(2, "0"),
  ].join(":");
  return { date, time };
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ReservationManageView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [reservationsForDate, setReservationsForDate] = useState<SlotCapacityRow[]>([]);
  const [reservation, setReservation] = useState<ManagedReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [guestCount, setGuestCount] = useState(2);
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("18:00");
  const [notes, setNotes] = useState("");

  const minDate = useMemo(() => todayIsoDate(), []);
  const canEdit = reservation ? MANAGEABLE.includes(reservation.status) : false;

  useEffect(() => {
    void fetchAppSettings().then(({ data }) => setAppSettings(data));
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Missing manage link. Open the link from your email.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetch(`/api/reservations/manage?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          reservation?: ManagedReservation;
        };
        if (cancelled) return;
        if (!response.ok || !payload.reservation) {
          setError(payload.error || "Reservation not found.");
          setReservation(null);
          return;
        }
        const row = payload.reservation;
        setReservation(row);
        const parts = splitReservedAt(row.reservedAt);
        setDate(parts.date);
        setTime(parts.time);
        setGuestCount(row.partySize);
        setNotes(row.notes ?? "");
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load reservation.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

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
    // Capacity filter does not know exclude-self; API enforces exclude. Keep current time visible.
    const capacityFiltered = filterSlotsByCapacity(
      futureSlots,
      reservationsForDate,
      date,
      appSettings.reservationTimeStep,
      appSettings.reservationMaxGuestsPerSlot,
      guestCount,
    );
    if (reservation) {
      const current = splitReservedAt(reservation.reservedAt);
      if (current.date === date && !capacityFiltered.includes(current.time) && futureSlots.includes(current.time)) {
        return [...capacityFiltered, current.time].sort();
      }
    }
    return capacityFiltered;
  }, [
    appSettings.reservationMaxGuestsPerSlot,
    appSettings.reservationOperatingHours,
    appSettings.reservationTimeStep,
    date,
    guestCount,
    reservation,
    reservationsForDate,
  ]);

  useEffect(() => {
    if (availableTimeSlots.length === 0) return;
    if (!availableTimeSlots.includes(time)) {
      setTime(availableTimeSlots[0]);
    }
  }, [availableTimeSlots, time]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/reservations/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date,
          time,
          guestCount,
          notes: notes.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reservation?: ManagedReservation;
        emailSent?: boolean;
      };
      if (!response.ok || !payload.reservation) {
        setError(payload.error || "Could not update reservation.");
        return;
      }
      setReservation(payload.reservation);
      setMessage(
        payload.emailSent
          ? "Reservation updated. We sent you an email with the new details."
          : "Reservation updated.",
      );
    } catch {
      setError("Could not update reservation.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!token || !canEdit) return;
    if (!window.confirm("Cancel this reservation?")) return;
    setCancelling(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/reservations/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reservation?: ManagedReservation;
        emailSent?: boolean;
      };
      if (!response.ok || !payload.reservation) {
        setError(payload.error || "Could not cancel reservation.");
        return;
      }
      setReservation(payload.reservation);
      setMessage(
        payload.emailSent
          ? "Reservation cancelled. A confirmation email was sent."
          : "Reservation cancelled.",
      );
    } catch {
      setError("Could not cancel reservation.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="inline-flex rounded-full bg-red-600/20 p-3 text-red-400">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">SEOUL PRAGUE</p>
            <h1 className="text-2xl font-bold text-white">Manage reservation</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-8 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error && !reservation ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-5 py-6 text-sm text-red-200">
            {error}
          </div>
        ) : reservation ? (
          <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl">
            <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div className="text-sm">
                <p className="font-semibold text-white">
                  {reservation.bookingCode} · {reservation.status.replace("_", " ")}
                </p>
                <p className="mt-1 text-zinc-300">
                  {reservation.guestName} · {reservation.partySize} guests
                </p>
                <p className="mt-1 text-zinc-400">{formatWhen(reservation.reservedAt)}</p>
              </div>
            </div>

            {message && (
              <p className="rounded-xl bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
                {message}
              </p>
            )}
            {error && (
              <p className="rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</p>
            )}

            {canEdit ? (
              <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm sm:col-span-1">
                    <span className="font-medium text-zinc-200">Guests</span>
                    <select
                      value={guestCount}
                      onChange={(event) => setGuestCount(Number(event.target.value))}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                    >
                      {guestOptions.map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm sm:col-span-1">
                    <span className="font-medium text-zinc-200">Date</span>
                    <input
                      type="date"
                      value={date}
                      min={minDate}
                      onChange={(event) => setDate(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                      required
                    />
                  </label>
                  <label className="block text-sm sm:col-span-1">
                    <span className="font-medium text-zinc-200">Time</span>
                    <select
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                      required
                    >
                      {availableTimeSlots.length === 0 ? (
                        <option value="">No times</option>
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
                  <span className="font-medium text-zinc-200">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                  />
                </label>

                <button
                  type="submit"
                  disabled={saving || availableTimeSlots.length === 0}
                  className="w-full rounded-xl bg-red-600 py-3.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => void handleCancel()}
                  className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
                >
                  {cancelling ? "Cancelling…" : "Cancel reservation"}
                </button>
              </form>
            ) : (
              <p className="text-sm text-zinc-400">
                This reservation can no longer be changed online ({reservation.status}).
                Contact the restaurant if you need help.
              </p>
            )}
          </div>
        ) : null}

        <p className="mt-6 text-center text-xs text-zinc-500">
          <a href="/reservation" className="text-red-400 hover:text-red-300">
            ← Book a new table
          </a>
        </p>
      </div>
    </div>
  );
}
