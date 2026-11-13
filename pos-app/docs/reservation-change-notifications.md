# Reservation change notifications

Guests cancelling through their manage link must choose Change of plans, Booked by
mistake, Duplicate reservation, or Other. Other requires an explanation. Additional
details are limited to 300 characters. Staff retain the existing restaurant reasons
and gain the two new reasons. Cancellation stores the selected code, note and actor
in the existing reservation cancellation columns.

Foreground POS alerts, browser notifications and background Web Push use the same
detail formatter. Cancellation copy includes the reason, optional details and actor.
Updates describe party size and Prague wall-clock date/time before and after the
write. Name changes are described; notes/contact/occasion changes are identified
without exposing their values on a phone lock screen. Unchanged saves do not send
an update push. Different bookings use distinct push tags.

Guest updates/cancellations compare the original updated_at and manageable status
at write time. Staff detail updates also compare updated_at, preserving a meaningful
before snapshot and rejecting concurrent edits instead of publishing stale changes.
The staff push endpoint reads current values and cancellation metadata from the
database, validates supplied before fields, and skips superseded detail updates.
Email-delivery timestamp changes do not suppress cancellation pushes.

Guest push work uses Next.js after() so it remains attached to the request lifetime.
Staff requests use keepalive when notifying after a mutation. Existing VAPID keys,
subscriptions, browser permission and OS delivery settings are still required.
No live notification was sent as part of development verification.

No new columns or migration are introduced. The existing cancellation columns from
supabase/patch-reservation-capacity-engine.sql must already be installed. Cancellation
does not silently discard the reason through a legacy status-only fallback. Private
staff cancellation notes are not exposed in guest manage responses or guest emails.
