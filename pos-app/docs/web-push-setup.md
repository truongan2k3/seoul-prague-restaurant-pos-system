# Web Push — reservation alerts when POS is closed

## One-time setup

1. **Supabase SQL** — run `pos-app/supabase/patch-push-subscriptions.sql` in the SQL editor.
2. **Vercel → Settings → Environment Variables** add:

- `VAPID_PRIVATE_KEY` = *(see PR notes / ops — never commit)*
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `BKhVDedYOsTXbb-mfmoi8aWYOol6NUkTLP3iXIyj9babw6VEo0bZ11vgJuGaHGNndbTTwN85irAtpmJ33ukgAvQ`
- `VAPID_SUBJECT` = `mailto:pos@seoulprague.com`

3. Redeploy the app after saving env vars.

## On each phone

1. Open POS `/app`, log in, tap **Allow** for notifications.
2. **iPhone:** Share → **Add to Home Screen**, then open from the home-screen icon (required for background push on iOS).
3. Android Chrome: allowing notifications is usually enough (HTTPS).

Closing the tab is fine after that — new / update / cancel / no-show still notify. Check-in does not.

## Verify this phone

Open the POS notification bell → **Test phone push**. The button registers the current
device and sends a real push only to that device's saved subscription, owned by the
signed-in staff session. It never broadcasts a test to other staff devices.

“Accepted by the push service” means the provider accepted the request, not that
the operating system displayed it. Confirm that this phone shows the notification.
If it does not, check site notification permission, OS notification settings,
Focus/Do Not Disturb, network connectivity and battery restrictions. iOS requires
opening the installed home-screen web app.

## Delivery behavior

- Reservation creation, updates/cancellations, voucher orders/payment notices and
  guest chat start dispatch immediately after successful persistence, independently
  of email and Realtime latency. Next.js `after` retains the running task on Vercel.
- Web Push uses high urgency, a 4-second socket timeout and one bounded retry for
  transient failures. Expired 404/410 subscriptions are removed. Missing keys and
  unavailable subscription storage return explicit errors from push endpoints.
- The service worker displays received push even with a focused website tab.
  Shared notification tags replace foreground/background echoes quietly.
- POS reservation listeners dedupe actual event versions, so rapid separate edits
  are retained. Older arriving broadcasts are ignored; reconnect triggers catch-up.
- Kitchen/bar order/ready notifications retain their existing POS Realtime paths;
  they are not added to the background Web Push categories by this change.

This is immediate best-effort delivery, not a durable notification outbox. A process
crash or outage longer than the bounded retries can still lose a push. Provider/OS
delivery time cannot be guaranteed. No claim of instant phone receipt should be
made solely from a successful server response.

## Local verification

Run `npm run test:notifications`. Tests execute the real transport, route handlers,
reservation listener and shipped worker with isolated fake storage/providers;
they do not modify production bookings or send live staff notifications.
