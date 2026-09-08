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
