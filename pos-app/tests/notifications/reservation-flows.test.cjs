/* eslint-disable @typescript-eslint/no-require-imports -- Run real handlers and listeners with fake persistence and push transport. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modules, flush, reservation, id } = require('./helpers.cjs');

test('phone copy includes guest/staff cancellation reasons and Prague before/after values', () => {
  const load = modules({
    'web-push': {}, 'next/server': {}, '@/src/lib/supabase-admin': {},
  });
  const { reservationPushCopy } = load('src/lib/push-server.ts');
  const previous = reservation();
  const updated = reservationPushCopy({ kind: 'updated', ...previous, partySize: 5,
    reservedAt: '2026-11-13T20:00:00Z', previous });
  assert.match(updated.title, /Party size: 9 → 5/);
  assert.match(updated.body, /Time: 19:00 → 21:00/);
  for (const actor of ['guest','Test staff']) {
    const cancelled = reservationPushCopy({ kind: 'cancelled', ...previous,
      cancellationReason: 'duplicate', cancellationNote: 'Booked twice', cancelledBy: actor });
    assert.match(cancelled.title, /cancelled due to duplicate reservation/i);
    assert.ok(cancelled.body.includes(actor));
    assert.match(cancelled.body, /Booked twice/);
  }
});

function routes({ changed = true } = {}) {
  const pushes = [], emails = [], broadcasts = [];
  let releaseBroadcast, releaseHold;
  const previous = reservation();
  const next = reservation({ partySize: changed ? 5 : 9 });
  const load = modules({
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/src/lib/reservation-guest-server': {
      createOnlineReservationServer: async () => ({ data: next }),
      fetchReservationByManageToken: async () => ({ data: next }),
      updateReservationByManageToken: async () => ({ data: next, previous }),
      cancelReservationByManageToken: async (_token, options) => ({ data: {
        ...next, status: 'cancelled', cancellationReason: options.cancellationReason,
        cancellationNote: options.cancellationNote, cancelledBy: 'guest',
      } }),
    },
    '@/src/lib/reservation-holds': { releaseReservationHold: () => new Promise(resolve => { releaseHold = resolve; }) },
    '@/src/lib/push-server': { reservationPushCopy: data => data, dispatchPosPush: data => pushes.push(data) },
    '@/src/lib/reservation-guest-alert-server': { broadcastGuestReservationAlert: data => {
      broadcasts.push(data); return new Promise(resolve => { releaseBroadcast = resolve; });
    } },
    '@/src/lib/reservation-email': { buildManageUrl: () => '/manage/test',
      sendReservationEmail: async () => { emails.push(1); return { sent: true }; } },
  });
  return { load, pushes, emails, broadcasts, releaseBroadcast: () => releaseBroadcast(), releaseHold: () => releaseHold() };
}
const request = (body, method = 'PATCH') => new Request('https://pos.invalid/api/reservations/manage', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('new booking starts push before waiting for hold cleanup or email', async () => {
  const h = routes();
  const pending = h.load('app/api/reservations/book/route.ts').POST(request({ guestCount: 5 }, 'POST'));
  await flush();
  assert.equal(h.pushes.length, 1); assert.equal(h.pushes[0].reservationId, id);
  assert.equal(h.emails.length, 0);
  h.releaseHold(); assert.equal((await pending).status, 200);
});

test('guest edit/cancellation starts push before a slow Realtime broadcast or email', async () => {
  for (const kind of ['updated','cancelled']) {
    const h = routes();
    const api = h.load('app/api/reservations/manage/route.ts');
    const pending = kind === 'updated' ? api.PATCH(request({ token: 'test', guestCount: 5 }))
      : api.DELETE(request({ token: 'test', cancellationReason: 'duplicate', cancellationNote: 'Booked twice' }, 'DELETE'));
    await flush();
    assert.equal(h.pushes.length, 1); assert.equal(h.emails.length, 0);
    assert.equal(h.pushes[0].kind, kind);
    if (kind === 'updated') assert.equal(h.pushes[0].previous.partySize, 9);
    else assert.equal(h.pushes[0].cancellationReason, 'duplicate');
    h.releaseBroadcast(); assert.equal((await pending).status, 200);
  }
});

test('saving unchanged reservation does not send push or broadcast', async () => {
  const h = routes({ changed: false });
  assert.equal((await h.load('app/api/reservations/manage/route.ts').PATCH(request({ token: 'test' }))).status, 200);
  assert.equal(h.pushes.length, 0); assert.equal(h.broadcasts.length, 0);
});

test('foreground handles rapid edits, edit reversal and duplicate transport echoes', async () => {
  const effects = [], toasts = [], browser = [];
  let handlers, guestAlert;
  const original = reservation();
  const load = modules({
    react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    '@/contexts/app-context': { useApp: () => ({ translate: key => key, language: 'en' }) },
    '@/contexts/notification-context': { useNotifications: () => ({ pushNotification: data => toasts.push(data) }) },
    '@/contexts/settings-context': { useSettings: () => ({ settings: { soundConfigs: { notifications: {} }, reservationTableHoldingTime: 30 } }) },
    '@/lib/browser-notification': { ensureBrowserNotificationPermission() {}, showBrowserNotification: data => browser.push(data) },
    '@/lib/notification-sound': { playNotificationCategory() {} },
    '@/lib/notification-preferences': { claimNotificationEvent: () => true },
    '@/src/lib/guest-history-actions': { guestVisitProfileKey: () => '', fetchGuestVisitProfile: async () => ({ data: { isReturning: false } }) },
    '@/components/modal': { Modal: () => null },
    '@/components/guest-returning-badge': { GuestReturningBadge: () => null },
    '@/src/lib/reservation-actions': {
      fetchReservations: async () => ({ data: [original] }), mapReservationsResponse: data => data,
      subscribeToReservationChanges: h => { handlers = h; return () => {}; },
      subscribeToGuestReservationAlerts: fn => { guestAlert = fn; return () => {}; },
    },
  }, { window: { addEventListener() {}, removeEventListener() {} }, document: { addEventListener() {}, removeEventListener() {} }, navigator: { vibrate() {} } });
  load('components/reservation-incoming-listener.tsx').ReservationIncomingListener({ enableLateMarker: false });
  for (const effect of effects) effect();
  await flush();
  const first = reservation({ partySize: 5, updatedAt: new Date('2026-11-13T12:00:01Z') });
  handlers.onUpdate(first);
  assert.equal(toasts.length, 1); assert.match(toasts[0].message, /Party size: 9 → 5/);
  guestAlert({ kind: 'updated', reservation: { ...first, updatedAt: first.updatedAt.toISOString(), reservedAt: first.reservedAt.toISOString() }, previous: original });
  assert.equal(toasts.length, 1, 'Realtime + broadcast echo must dedupe');
  const second = reservation({ partySize: 3, updatedAt: new Date('2026-11-13T12:00:02Z') });
  handlers.onUpdate(second);
  assert.equal(toasts.length, 2); assert.match(toasts[1].message, /Party size: 5 → 3/);
  handlers.onUpdate(reservation({ partySize: 5, updatedAt: new Date('2026-11-13T12:00:03Z') }));
  assert.equal(toasts.length, 3, 'reverting an edit is a new event');
  guestAlert({ kind: 'updated', reservation: { ...first, updatedAt: first.updatedAt.toISOString(), reservedAt: first.reservedAt.toISOString() }, previous: original });
  assert.equal(toasts.length, 3, 'late broadcast must not overwrite newer state');
  assert.equal(browser.length, 3);
});

test('device push test requires sign-in and derives target owner from session', async () => {
  for (const staff of [null, { staffId: 'signed-in-staff' }]) {
    const sent = [];
    const load = modules({
      'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
      '@/src/lib/auth/staff-session': { readStaffSession: async () => staff },
      '@/src/lib/push-server': { sendPosPush: async (payload, target) => { sent.push({ payload, target }); return { sent: 1, failed: 0 }; } },
    });
    const result = await load('app/api/push/test/route.ts').POST(request({ endpoint: 'https://push.invalid/device', staffId: 'forged-owner' }, 'POST'));
    assert.equal(result.status, staff ? 200 : 401);
    if (staff) assert.equal(sent[0].target.staffId, 'signed-in-staff');
    else assert.equal(sent.length, 0);
  }
});

test('metadata writes to no-show reservations do not create new alerts', () => {
  const load = modules();
  const before = reservation({ status: 'no_show' });
  const after = reservation({ status: 'no_show', updatedAt: new Date('2026-11-13T12:01:00Z') });
  assert.equal(load('lib/reservation-change-alert.ts').classifyReservationUpdate(before, after), null);
});
