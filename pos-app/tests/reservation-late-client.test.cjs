/* eslint-disable @typescript-eslint/no-require-imports -- Exercise actual client modules with fake persistence and browser timers. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { modules } = require('./notifications/helpers.cjs');

test('auto-Late update cannot overwrite concurrent check-in, cancellation or rescheduling', async () => {
  const past = new Date(Date.now()-2*60*60*1000).toISOString();
  const rows = ['arrived','cancelled','rescheduled','overdue'].map(id => ({ id, status: 'confirmed', reserved_at: past }));
  const snapshots = rows.map(row => ({ ...row }));
  const query = {
    filters: [], payload: null,
    select() {
      if (!this.payload) return this;
      const updated = rows.filter(row => this.filters.every(fn => fn(row)));
      for (const row of updated) Object.assign(row, this.payload);
      return Promise.resolve({ data: updated.map(row => ({ id: row.id })), error: null });
    },
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; },
    gte() { return Promise.resolve({ data: snapshots, error: null }); },
    lt(key, value) { this.filters.push(row => row[key] < value); return this; },
    update(payload) {
      this.payload = payload; this.filters = [];
      rows[0].status = 'checked_in'; rows[1].status = 'cancelled';
      rows[2].reserved_at = new Date(Date.now()+60*60*1000).toISOString();
      return this;
    },
  };
  const load = modules({
    '@/src/lib/supabase': { supabase: { from: () => query } },
    '@/src/lib/settings-actions': {}, '@/lib/web-push-client': {},
  });
  const result = await load('src/lib/reservation-actions.ts').markLateReservations(30);
  assert.equal(result.updated, 1);
  assert.deepEqual(rows.map(row => row.status), ['checked_in','cancelled','confirmed','late']);
});

test('visible guest forms refresh after release, with hidden-tab suppression and cleanup', () => {
  const effects = [], listeners = new Map(); let revision = 0, interval, cleared = false;
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const load = modules({ react: {
    useState: () => [0, update => { revision = update(revision); }],
    useEffect: fn => effects.push(fn),
  } }, { document, window: {
    setInterval(fn, ms) { assert.equal(ms, 30000); interval = fn; return 1; },
    clearInterval() { cleared = true; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  } });
  const useRefresh = load('hooks/use-reservation-availability-refresh.ts').useReservationAvailabilityRefresh;
  useRefresh(true); const cleanup = effects[0]();
  interval(); assert.equal(revision, 1);
  document.hidden = true; interval(); assert.equal(revision, 1);
  document.hidden = false; listeners.get('visibilitychange')(); listeners.get('online')();
  assert.equal(revision, 3);
  cleanup(); assert.equal(cleared, true); assert.equal(listeners.size, 0);
});

test('availability polling is disabled during a booking hold or submission', () => {
  let effect, intervals = 0;
  const load = modules({ react: { useState: () => [0, () => {}], useEffect: fn => { effect = fn; } } }, {
    window: { setInterval() { intervals++; } }, document: {},
  });
  load('hooks/use-reservation-availability-refresh.ts').useReservationAvailabilityRefresh(false);
  effect(); assert.equal(intervals, 0);
});
