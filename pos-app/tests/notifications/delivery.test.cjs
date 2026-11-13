/* eslint-disable @typescript-eslint/no-require-imports -- Isolated behavioral tests; never send real notifications. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modules, flush } = require('./helpers.cjs');

function harness({ subscriptions, send, env, storageError, invalidVapid } = {}) {
  const afters = [], calls = [], removed = [], filters = [];
  const subs = subscriptions ?? [{ id: 'device', endpoint: 'https://push.invalid/device', p256dh: 'key', auth: 'secret' }];
  const query = {
    select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    async limit() { return { data: subs, error: storageError ? { message: 'unavailable' } : null }; },
    delete() { return { eq: async (_key, endpoint) => { removed.push(endpoint); } }; },
  };
  const load = modules({
    'next/server': { after: fn => afters.push(fn) },
    'web-push': {
      setVapidDetails() { if (invalidVapid) throw Error('invalid secret'); },
      async sendNotification(sub, body, options) {
        calls.push({ sub, body: JSON.parse(body), options });
        if (send) await send(sub, calls.length);
        return { statusCode: 201 };
      },
    },
    '@/src/lib/supabase-admin': { createSupabaseAdmin: () => ({ from: () => query }) },
  }, {
    process: { env: env ?? { VAPID_PRIVATE_KEY: 'fixture-private-key' } },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    console: { warn() {}, error() {} },
  });
  return { api: load('src/lib/push-server.ts'), load, calls, afters, removed, filters };
}
const payload = { kind: 'new', title: 'New reservation', body: '9 pax', tag: 'booking-1' };

test('dispatch starts immediately and Vercel after retains in-flight delivery', async () => {
  let release;
  const h = harness({ send: () => new Promise(resolve => { release = resolve; }) });
  h.api.dispatchPosPush(payload);
  assert.equal(h.afters.length, 1);
  await flush();
  assert.equal(h.calls.length, 1, 'must not wait for after-response callback to start');
  let finished = false;
  const retained = h.afters[0]().then(() => { finished = true; });
  await flush(); assert.equal(finished, false);
  release(); await retained; assert.equal(finished, true);
  assert.equal(h.calls[0].options.urgency, 'high');
  assert.equal(h.calls[0].options.timeout, 4000);
});

test('all existing push categories use the same immediate transport', async () => {
  const h = harness();
  for (const kind of ['new','updated','cancelled','no_show','voucher_order','voucher_guest_paid','guest_chat','guest_chat_follow_up']) {
    const result = await h.api.sendPosPush({ ...payload, kind });
    assert.equal(result.sent, 1); assert.equal(result.failed, 0);
  }
  assert.equal(h.calls.length, 8);
});

test('temporary failure retries once, without blocking another device', async () => {
  let first = true;
  const h = harness({ subscriptions: [
    { id: 'a', endpoint: 'https://push.invalid/a', p256dh: 'key', auth: 'secret' },
    { id: 'b', endpoint: 'https://push.invalid/b', p256dh: 'key', auth: 'secret' },
  ], send(sub) { if (sub.endpoint.endsWith('/a') && first) { first = false; throw { statusCode: 503 }; } } });
  const result = await h.api.sendPosPush(payload);
  assert.equal(result.sent, 2); assert.equal(result.failed, 0);
  assert.deepEqual(h.calls.map(c => c.sub.endpoint.slice(-1)), ['a','b','a']);
});

test('expired devices are removed, permanent failures not retried, outages bounded', async () => {
  for (const statusCode of [404,410,403,500,0]) {
    const h = harness({ send() { throw { statusCode }; } });
    const result = await h.api.sendPosPush(payload);
    assert.equal(result.failed, 1);
    assert.equal(h.calls.length, statusCode === 500 || statusCode === 0 ? 2 : 1);
    assert.equal(h.removed.length, statusCode === 404 || statusCode === 410 ? 1 : 0);
  }
});

test('missing keys, invalid keys and unavailable storage never report false success', async () => {
  for (const options of [{ env: {} }, { invalidVapid: true }, { storageError: true }]) {
    const h = harness(options);
    const result = await h.api.sendPosPush(payload);
    assert.ok(result.error); assert.equal(result.sent, 0); assert.equal(h.calls.length, 0);
  }
});

test('device test filters by both endpoint and signed-in staff; never broadcasts', async () => {
  const h = harness();
  await h.api.sendPosPush({ ...payload, kind: 'test' }, { endpoint: 'https://push.invalid/device', staffId: 'staff-1' });
  assert.deepEqual(h.filters, [['endpoint','https://push.invalid/device'],['staff_id','staff-1']]);
});
