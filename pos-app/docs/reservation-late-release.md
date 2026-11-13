# Late reservations release capacity

Late is still a booking/history state and remains eligible for staff check-in.
It no longer holds guest counts, a seating allocation, a future-table deadline or
a check-in reservation warning. Planned table links are retained for reference.
Actual POS occupancy, active check-ins and manual table locks still block seats.
Reactivating a Late booking as Confirmed must pass capacity/table validation again.

Guest booking/manage forms refresh availability every 30 seconds while visible,
and on focus, resume or reconnect. Refresh pauses during submission and while a
booking hold exists. No guest booking records are exposed through new subscriptions.

## Apply to the database once

Run `supabase/patch-reservation-late-release.sql` in the existing Supabase SQL Editor
after the other reservation patches. It updates installed table/check-in functions
in place, retaining their authorization, locks, override rules, grants and signatures.
It is safe to rerun and does not rewrite booking records, assignments or table state.

The application changes alone release online capacity; this SQL step is also needed
so existing database guards permit staff to assign/check in against released Late
bookings. The patch has been checked locally using PGlite with the repository's
actual guard/check-in definitions. It has not been applied to live Supabase here.

Do not rerun older assignment/check-in patches afterward without reapplying this
patch, because those older definitions still treat Late as a capacity hold.
