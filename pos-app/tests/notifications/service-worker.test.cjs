/* eslint-disable @typescript-eslint/no-require-imports -- Execute the shipped worker against fake browser APIs. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('received push displays immediately with closed, hidden, focused POS and public tabs', async () => {
  for (const windows of [[], [{ visibilityState: 'hidden' }],
    [{ visibilityState: 'visible', focused: true, url: 'https://pos.invalid/app' }],
    [{ visibilityState: 'visible', focused: true, url: 'https://pos.invalid/menu' }]]) {
    const events = {}, shown = [];
    vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'), { self: {
      addEventListener: (event, handler) => { events[event] = handler; },
      clients: { matchAll: async () => windows },
      registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    } });
    let retained;
    events.push({ data: { json: () => ({ title: 'Reservation cancelled due to duplicate reservation',
      body: 'Cancelled by: guest', tag: 'reservation-cancelled-test' }) }, waitUntil: promise => { retained = promise; } });
    assert.ok(retained); await retained;
    assert.equal(shown.length, 1);
    assert.match(shown[0].title, /duplicate/);
    assert.equal(shown[0].options.tag, 'reservation-cancelled-test');
    assert.equal(shown[0].options.renotify, false);
  }
});
