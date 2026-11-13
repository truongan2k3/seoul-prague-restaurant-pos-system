/* eslint-disable @typescript-eslint/no-require-imports -- Fake browser registration and HTTP only. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modules, flush, id } = require('./helpers.cjs');

function client({ permission = 'granted', stale = false, response } = {}) {
  const requests = [], counts = { prompt: 0, register: 0, subscribe: 0, unsubscribe: 0 };
  const subscription = {
    endpoint: 'https://push.invalid/this-device',
    options: { applicationServerKey: new Uint8Array(stale ? [9,9,9] : [1,2,3]).buffer },
    toJSON: () => ({ endpoint: 'https://push.invalid/this-device', keys: { auth: 'fixture', p256dh: 'fixture' } }),
    async unsubscribe() { counts.unsubscribe++; return true; },
  };
  const active = { pushManager: {
    getSubscription: async () => subscription,
    subscribe: async () => { counts.subscribe++; return subscription; },
  } };
  const Notification = { permission, async requestPermission() { counts.prompt++; return 'granted'; } };
  const load = modules({ '@/lib/push-vapid-public': { getVapidPublicKey: () => 'AQID' } }, {
    window: { PushManager() {}, Notification }, Notification, atob,
    navigator: { serviceWorker: {
      ready: Promise.resolve(active),
      async register() { counts.register++; return { pushManager: { getSubscription() { throw Error('installing worker must not be used'); } } }; },
    } },
    fetch: async (url, options) => { requests.push({ url, options }); return response ? response(requests.length) : { ok: true }; },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    console: { warn() {} },
  });
  return { api: load('lib/web-push-client.ts'), requests, counts };
}

test('background bootstrap preserves the user-gesture notification permission prompt', async () => {
  const h = client({ permission: 'default' });
  assert.equal(await h.api.ensurePushSubscription({ requestPermission: false }), 'prompt');
  assert.equal(h.counts.prompt, 0); assert.equal(h.requests.length, 0);
});

test('concurrent initializations share one active-worker registration and subscription save', async () => {
  const h = client();
  const results = await Promise.all([h.api.ensurePushSubscription(), h.api.ensurePushSubscription()]);
  assert.deepEqual(results, ['subscribed','subscribed']);
  assert.equal(h.counts.register, 1); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/push/subscribe');
});

test('VAPID key rotation replaces stale device subscriptions before saving', async () => {
  const h = client({ stale: true });
  assert.equal(await h.api.ensurePushSubscription(), 'subscribed');
  assert.equal(h.counts.unsubscribe, 1); assert.equal(h.counts.subscribe, 1);
});

test('staff notification HTTP request retries brief outages without repeating booking mutations', async () => {
  const h = client({ response: count => count === 1 ? Promise.reject(Error('offline')) : { ok: true } });
  h.api.notifyReservationPushEvent({ kind: 'cancelled', reservationId: id,
    guestName: 'Fixture', partySize: 5, reservedAt: new Date(), cancellationReason: 'duplicate' });
  await flush();
  assert.equal(h.requests.length, 2);
  for (const call of h.requests) {
    assert.equal(call.url, '/api/push/reservation-event');
    assert.equal(call.options.keepalive, true);
    assert.equal(JSON.parse(call.options.body).cancellationReason, 'duplicate');
  }
});

test('blocked permission and failed subscription storage never claim device ready', async () => {
  const denied = client({ permission: 'denied' });
  assert.equal(await denied.api.ensurePushSubscription(), 'denied');
  assert.equal(denied.requests.length, 0);
  const failed = client({ response: () => ({ ok: false, status: 401 }) });
  assert.equal(await failed.api.ensurePushSubscription(), 'error');
});
